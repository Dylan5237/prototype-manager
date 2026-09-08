const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { requireAuth, requireRole, generateToken } = require('../middleware/auth');
const { findUserById } = require('../services/db-users');
const { createConnectCode } = require('../services/db-mcp-sessions');
const { createBootstrapSession, readBootstrapSession } = require('../services/db-bootstrap-sessions');
const {
  buildStandaloneBootstrap,
  buildOnboardingScript,
  renderOnboardingLauncherCommand,
  sha256
} = require('../services/standalone-bootstrap');
const { listOnboardingHosts, getOnboardingHost, renderSafeStopPrompt } = require('../services/onboarding-hosts');
const { GitLabProvider } = require('../services/gitlab-provider');
const {
  AgentUpdateError,
  createRelease,
  getReleaseInfo,
  listPublishedReleases,
  getAvailableUpdates,
  createUpdateIntent,
  getUpdateIntent,
  claimUpdateIntent,
  recordUpdateResult
} = require('../services/db-agent-updates');
const {
  prepareArtifactBundle,
  commitArtifactBundle,
  discardArtifactBundle,
  removeArtifactBundle,
  getArtifactMetadata
} = require('../services/agent-artifacts');
const { renderPromptTemplate } = require('../services/db-prompt-templates');
const { getQuickStartPromptVariables } = require('../services/help-prompt-snapshot');

const router = express.Router();
const SKILL_NAME = 'fuxi-prototype';
const EXCLUDED_NAMES = new Set([
  '.git', '.npmrc', '.credentials.json', 'node_modules', 'dist', 'build',
  'coverage', 'tests', 'standalone'
]);
const BOOTSTRAP_SNAPSHOT_ROOT = path.resolve(__dirname, '../data/bootstrap-sessions');

function publicBaseUrl(req) {
  const forwarded = req.headers['x-forwarded-proto'];
  const protocol = forwarded ? String(forwarded).split(',')[0].trim() : req.protocol;
  const forwardedHost = req.headers['x-forwarded-host'];
  const forwardedPort = req.headers['x-forwarded-port'];
  let host = forwardedHost ? String(forwardedHost).split(',')[0].trim() : req.get('host');
  const port = forwardedPort ? String(forwardedPort).split(',')[0].trim() : '';
  if (port && !/:\d+$/.test(host)) {
    host = `${host}:${port}`;
  }
  return `${protocol}://${host}`;
}

function formatLocalTime(iso) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(iso));
  const get = type => (parts.find(p => p.type === type) || {}).value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function configuredDirectory(envName, fallback, marker) {
  const configured = process.env[envName];
  const resolved = path.resolve(configured || fallback);
  return fs.existsSync(path.join(resolved, ...marker)) ? resolved : null;
}

function configuredSkillDir() {
  if (!process.env.FUXI_SKILL_DIR) return null;
  return configuredDirectory('FUXI_SKILL_DIR', '', ['SKILL.md']);
}

function configuredMcpDir() {
  return configuredDirectory(
    'FUXI_MCP_DIR',
    path.resolve(__dirname, '../../mcp-server'),
    ['src', 'server.js']
  );
}

function addDirectory(zip, root, prefix) {
  const walk = (dir, relative = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_NAMES.has(entry.name) || entry.name.endsWith('.zip') || entry.name.endsWith('.log')) continue;
      const absolute = path.join(dir, entry.name);
      const childRelative = relative ? path.posix.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) walk(absolute, childRelative);
      else zip.addFile(path.posix.join(prefix, childRelative), fs.readFileSync(absolute));
    }
  };
  walk(root);
}

function sendZipBuffer(res, filename, buffer) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}

function packageBuffer(sourceRoot, prefix) {
  const zip = new AdmZip();
  addDirectory(zip, sourceRoot, prefix);
  return zip.toBuffer();
}

function standaloneBootstrapBuffer() {
  const mcpDir = configuredMcpDir();
  if (!mcpDir) return null;
  try {
    return Buffer.from(buildStandaloneBootstrap({ mcpRoot: mcpDir }), 'utf8');
  } catch (error) {
    return null;
  }
}

function artifactMetadata(buffer) {
  return { sha256: sha256(buffer), size: buffer.length };
}

function bootstrapSnapshotDirectory(bootstrapId) {
  const value = String(bootstrapId || '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(value)) return null;
  return path.join(BOOTSTRAP_SNAPSHOT_ROOT, value);
}

function writeSnapshotFile(file, content) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, content, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function createBootstrapSnapshot({ bootstrapId, expiresAt, client, mcp, skill, standalone, onboarding, versions }) {
  const directory = bootstrapSnapshotDirectory(bootstrapId);
  if (!directory) throw new Error('Bootstrap snapshot id is invalid');
  if (fs.existsSync(BOOTSTRAP_SNAPSHOT_ROOT)) {
    for (const entry of fs.readdirSync(BOOTSTRAP_SNAPSHOT_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(BOOTSTRAP_SNAPSHOT_ROOT, entry.name, 'metadata.json');
      try {
        const metadata = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (Date.parse(metadata.expiresAt) <= Date.now()) fs.rmSync(path.dirname(candidate), { recursive: true, force: true });
      } catch (error) {}
    }
  }
  fs.mkdirSync(directory, { recursive: true });
  writeSnapshotFile(path.join(directory, 'mcp.zip'), mcp);
  writeSnapshotFile(path.join(directory, 'skill.zip'), skill);
  writeSnapshotFile(path.join(directory, 'fuxi-bootstrap.cjs'), standalone);
  writeSnapshotFile(path.join(directory, 'fuxi-onboard.cjs'), onboarding);
  const metadata = {
    schema: 'fuxi-bootstrap-snapshot/1',
    bootstrapId,
    expiresAt,
    client,
    versions,
    artifacts: {
      mcp: artifactMetadata(mcp),
      skill: artifactMetadata(skill),
      standalone: artifactMetadata(standalone),
      onboarding: artifactMetadata(onboarding)
    }
  };
  writeSnapshotFile(path.join(directory, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return { directory, metadata };
}

function readBootstrapSnapshot(bootstrapId) {
  const directory = bootstrapSnapshotDirectory(bootstrapId);
  if (!directory || !fs.existsSync(directory)) return null;
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
    if (metadata.schema !== 'fuxi-bootstrap-snapshot/1' || metadata.bootstrapId !== bootstrapId) return null;
    if (Date.parse(metadata.expiresAt) <= Date.now()) return null;
    const files = {
      mcp: path.join(directory, 'mcp.zip'),
      skill: path.join(directory, 'skill.zip'),
      standalone: path.join(directory, 'fuxi-bootstrap.cjs'),
      onboarding: path.join(directory, 'fuxi-onboard.cjs')
    };
    if (!Object.values(files).every(file => fs.existsSync(file))) return null;
    return { directory, metadata, files };
  } catch (error) {
    return null;
  }
}

function readSnapshotArtifact(bootstrapId, kind) {
  const snapshot = readBootstrapSnapshot(bootstrapId);
  if (!snapshot || !snapshot.files[kind]) return null;
  return fs.readFileSync(snapshot.files[kind]);
}

function componentVersion(root, relative, fallback = 'unknown') {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8'));
    return value && value.version ? String(value.version) : fallback;
  } catch (error) {
    return fallback;
  }
}

function skillVersion(skillDir) {
  try {
    const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    const match = content.match(/^version:\s*([^\r\n]+)$/mi);
    return match ? match[1].trim() : 'unversioned';
  } catch (error) {
    return 'unknown';
  }
}

function getBearerToken(req) {
  const value = req.headers.authorization;
  return value && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

router.get('/onboarding-hosts', requireAuth, (req, res) => {
  res.json({ success: true, data: listOnboardingHosts() });
});

router.get('/agent-bootstrap', requireAuth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(401).json({ success: false, message: '用户不存在' });
  const host = getOnboardingHost(req.query.host);
  if (!host) {
    return res.status(400).json({
      success: false,
      code: 'HOST_SELECTION_REQUIRED',
      message: '请先选择要接入的 AI 工具'
    });
  }
  if (host.mode !== 'install') {
    return res.json({
      success: true,
      data: {
        mode: host.mode,
        host: listOnboardingHosts().find(item => item.id === host.id),
        prompt: renderSafeStopPrompt(host),
        bootstrapSession: null,
        canonicalOnboarding: null
      }
    });
  }
  const skillDir = configuredSkillDir();
  const mcpDir = configuredMcpDir();
  const standalone = standaloneBootstrapBuffer();
  if (!skillDir || !mcpDir || !standalone) {
    return res.status(503).json({
      success: false,
      code: !skillDir ? 'SKILL_DISTRIBUTION_UNAVAILABLE' : !mcpDir ? 'MCP_DISTRIBUTION_UNAVAILABLE' : 'BOOTSTRAP_ARTIFACT_UNAVAILABLE',
      message: !skillDir ? '平台尚未配置 FUXI_SKILL_DIR，无法生成完整的一键接入提示词' : '平台尚未准备好独立 Bootstrap 制品，无法生成一键接入提示词'
    });
  }

  const baseUrl = publicBaseUrl(req);
  const bootstrapSession = createBootstrapSession({ userId: user.id, apiUrl: baseUrl, client: host.client });
  const mcpBuffer = packageBuffer(mcpDir, 'fuxi-platform-mcp');
  const skillBuffer = packageBuffer(skillDir, SKILL_NAME);
  const versions = {
    mcp: componentVersion(mcpDir, 'package.json'),
    skill: skillVersion(skillDir),
    minNode: '18.0.0'
  };
  const bootstrapIdQuery = `?bootstrapId=${encodeURIComponent(bootstrapSession.bootstrapId)}`;
  const bootstrapUrl = `${baseUrl}/api/integrations/bootstrap-package${bootstrapIdQuery}`;
  const bootstrapSessionUrl = `${baseUrl}/api/integrations/bootstrap-session`;
  const onboarding = Buffer.from(buildOnboardingScript({
    bootstrapUrl,
    sessionEndpoint: bootstrapSessionUrl,
    bootstrapSha256: sha256(standalone),
    session: bootstrapSession.credential,
    client: host.client
  }), 'utf8');
  const snapshot = createBootstrapSnapshot({
    bootstrapId: bootstrapSession.bootstrapId,
    expiresAt: bootstrapSession.expiresAt,
    client: host.client,
    mcp: mcpBuffer,
    skill: skillBuffer,
    standalone,
    onboarding,
    versions
  });
  const onboardingUrl = `${baseUrl}/api/integrations/onboarding-package${bootstrapIdQuery}`;
  const canonicalOnboardingCommand = renderOnboardingLauncherCommand({
    onboardingUrl,
    onboardingSha256: snapshot.metadata.artifacts.onboarding.sha256
  });
  const bootstrapSessionExpiresLocal = formatLocalTime(bootstrapSession.expiresAt);
  const helpPromptVariables = getQuickStartPromptVariables();
  const prompt = renderPromptTemplate('mcp.onboarding', {
    baseUrl,
    skillName: SKILL_NAME,
    hostLabel: host.label,
    hostInstructions: host.promptFragment,
    canonicalOnboardingCommand,
    canonicalBootstrapCommand: canonicalOnboardingCommand,
    bootstrapSessionExpiresLocal,
    ...helpPromptVariables
  });

  res.json({
    success: true,
    data: {
      mode: host.mode,
      host: listOnboardingHosts().find(item => item.id === host.id),
      prompt,
      bootstrapSession: {
        credential: bootstrapSession.credential,
        bootstrapId: bootstrapSession.bootstrapId,
        expiresAt: bootstrapSession.expiresAt
      },
      canonicalOnboarding: {
        command: canonicalOnboardingCommand,
        url: onboardingUrl,
        sha256: snapshot.metadata.artifacts.onboarding.sha256
      },
      apiUrl: baseUrl
    }
  });
});

router.get('/onboarding-package', (req, res) => {
  const buffer = req.query.bootstrapId ? readSnapshotArtifact(req.query.bootstrapId, 'onboarding') : null;
  if (!buffer) {
    return res.status(410).json({ success: false, code: 'ONBOARDING_SCRIPT_UNAVAILABLE', message: '短期接入脚本不存在或已失效' });
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fuxi-onboard.cjs"');
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
});

// 独立 Bootstrap 只包含安装器代码，不携带用户凭据；使用摘要由平台生成的命令校验完整性。
router.get('/bootstrap-package', (req, res) => {
  const buffer = req.query.bootstrapId
    ? readSnapshotArtifact(req.query.bootstrapId, 'standalone')
    : standaloneBootstrapBuffer();
  if (!buffer) {
    return res.status(503).json({ success: false, code: 'BOOTSTRAP_ARTIFACT_UNAVAILABLE', message: '独立 Bootstrap 制品不可用' });
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fuxi-bootstrap.cjs"');
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
});

// 短期会话只允许独立 Bootstrap 使用，Agent 不直接接触完整 manifest。
router.get('/bootstrap-session', (req, res) => {
  const session = readBootstrapSession(getBearerToken(req));
  if (!session.ok) {
    const status = session.reason === 'BOOTSTRAP_SESSION_EXPIRED' ? 410 : 401;
    return res.status(status).json({ success: false, code: session.reason, message: 'Bootstrap 会话无效或已过期' });
  }
  const user = findUserById(session.userId);
  if (!user) return res.status(401).json({ success: false, code: 'USER_NOT_FOUND', message: '用户不存在' });

  if (!session.client || !['workbuddy', 'cursor'].includes(session.client)) {
    return res.status(409).json({ success: false, code: 'BOOTSTRAP_HOST_UNBOUND', message: 'Bootstrap 会话未绑定受支持的 Host' });
  }
  const requestedClient = String(req.query.client || '').trim().toLowerCase();
  if (requestedClient && requestedClient !== session.client) {
    return res.status(400).json({ success: false, code: 'HOST_SELECTION_MISMATCH', message: '不得修改 Bootstrap 会话绑定的 Host' });
  }
  const snapshot = readBootstrapSnapshot(session.bootstrapId);
  if (!snapshot) {
    return res.status(410).json({ success: false, code: 'BOOTSTRAP_ARTIFACT_UNAVAILABLE', message: 'Bootstrap 会话制品不存在或已失效' });
  }
  if (snapshot.metadata.client !== session.client) {
    return res.status(409).json({ success: false, code: 'BOOTSTRAP_HOST_MISMATCH', message: 'Bootstrap 会话与制品绑定的 Host 不一致' });
  }
  const token = generateToken(user, { expiresIn: '3600s' });
  const connect = createConnectCode(user.id);
  const bootstrapIdQuery = `?bootstrapId=${encodeURIComponent(session.bootstrapId)}`;
  const manifest = {
    schema: 'fuxi-bootstrap/2',
    bootstrapId: session.bootstrapId,
    apiUrl: session.apiUrl,
    expiresAt: session.expiresAt,
    installToken: token,
    connectCode: connect.code,
    connectCodeExpiresAt: connect.expiresAt,
    artifacts: {
      mcp: { url: `${session.apiUrl}/api/integrations/mcp-package${bootstrapIdQuery}`, ...snapshot.metadata.artifacts.mcp },
      skill: { url: `${session.apiUrl}/api/integrations/skill-package${bootstrapIdQuery}`, ...snapshot.metadata.artifacts.skill }
    },
    versions: snapshot.metadata.versions,
    client: { name: session.client }
  };
  res.json({ success: true, data: { manifest, expiresAt: session.expiresAt, connectCodeExpiresAt: connect.expiresAt } });
});

function sendAgentUpdateError(res, error) {
  const status = error instanceof AgentUpdateError || Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({
    success: false,
    code: error.code || 'AGENT_UPDATE_FAILED',
    message: error.message || '组件更新操作失败',
    ...(error.details && Object.keys(error.details).length ? { details: error.details } : {})
  });
}

// 发布不可变 stable release。buildFromSources=true 时从当前配置的 MCP/Skill 源目录构建真实 ZIP。
router.post('/agent-releases', requireAuth, requireRole(['admin']), (req, res) => {
  let bundle = null;
  let committed = false;
  try {
    const body = req.body || {};
    const input = { ...(body.manifest || body) };
    const buildFromSources = Boolean(body.buildFromSources || input.buildFromSources);
    const releaseId = String(input.releaseId || '').trim();
    if (buildFromSources) {
      const mcpDir = configuredMcpDir();
      const skillDir = configuredSkillDir();
      if (!mcpDir || !skillDir) {
        throw new AgentUpdateError('AGENT_ARTIFACT_SOURCE_UNAVAILABLE', 'MCP/Skill 分发源目录不可用', 503);
      }
      bundle = prepareArtifactBundle({ releaseId, mcpDir, skillDir });
      const baseUrl = publicBaseUrl(req);
      input.artifacts = {
        mcp: {
          url: `${baseUrl}/api/integrations/agent-releases/${releaseId}/mcp.zip`,
          size: bundle.artifacts.mcp.size,
          sha256: bundle.artifacts.mcp.sha256
        },
        skill: {
          url: `${baseUrl}/api/integrations/agent-releases/${releaseId}/skill.zip`,
          size: bundle.artifacts.skill.size,
          sha256: bundle.artifacts.skill.sha256
        }
      };
    }
    if (!buildFromSources) {
      throw new AgentUpdateError('AGENT_ARTIFACT_BUILD_REQUIRED', '发布测试版本必须使用 buildFromSources=true 生成不可变制品', 400);
    }
    commitArtifactBundle(bundle);
    committed = true;
    const release = createRelease({ actorUserId: req.user.id, manifest: input });
    res.status(201).json({ success: true, data: release });
  } catch (error) {
    if (bundle) {
      if (committed) removeArtifactBundle(bundle.releaseId);
      else discardArtifactBundle(bundle);
    }
    sendAgentUpdateError(res, error);
  }
});

// launcher 使用既有设备会话下载已发布的固定制品；每次发送前重新验证文件摘要。
router.get('/agent-releases/:releaseId/:kind.zip', requireAuth, (req, res) => {
  try {
    const { releaseId, kind } = req.params;
    const release = getReleaseInfo(releaseId, true);
    if (!['mcp', 'skill'].includes(kind)) {
      throw new AgentUpdateError('INVALID_ARTIFACT_KIND', '制品类型只支持 mcp 或 skill', 400);
    }
    const artifact = getArtifactMetadata(releaseId, kind);
    if (!artifact) {
      throw new AgentUpdateError('AGENT_ARTIFACT_NOT_FOUND', '发布制品不存在', 404);
    }
    const expected = release.manifest && release.manifest.artifacts && release.manifest.artifacts[kind];
    if (!expected || expected.sha256 !== artifact.sha256 || Number(expected.size) !== Number(artifact.size)) {
      throw new AgentUpdateError('AGENT_ARTIFACT_INTEGRITY_FAILED', '服务端制品摘要与发布清单不一致', 500);
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(artifact.size));
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
    res.sendFile(artifact.path);
  } catch (error) {
    sendAgentUpdateError(res, error);
  }
});

// 读取当前设备可用更新；sessionId 必须属于当前用户。
router.get('/updates', requireAuth, (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || '');
    if (!sessionId) {
      return res.json({ success: true, data: { session: null, current: null, updates: listPublishedReleases() } });
    }
    res.json({ success: true, data: getAvailableUpdates({ userId: req.user.id, sessionId }) });
  } catch (error) {
    sendAgentUpdateError(res, error);
  }
});

// 用户确认“下次启动更新”；重复点击返回同一个活动意图。
router.post('/update-intents', requireAuth, (req, res) => {
  try {
    const { sessionId, releaseId } = req.body || {};
    const result = createUpdateIntent({ userId: req.user.id, sessionId, releaseId });
    res.status(result.created ? 201 : 200).json({ success: true, data: result });
  } catch (error) {
    sendAgentUpdateError(res, error);
  }
});

// launcher 启动时领取待更新意图；不返回 refresh token，只返回已发布 manifest。
router.post('/update-intents/claim', requireAuth, (req, res) => {
  try {
    const { sessionId } = req.body || {};
    res.json({ success: true, data: claimUpdateIntent({ userId: req.user.id, sessionId }) });
  } catch (error) {
    sendAgentUpdateError(res, error);
  }
});

router.get('/update-intents/:id', requireAuth, (req, res) => {
  try {
    res.json({ success: true, data: getUpdateIntent({ userId: req.user.id, intentId: req.params.id }) });
  } catch (error) {
    sendAgentUpdateError(res, error);
  }
});

router.post('/update-intents/:id/result', requireAuth, (req, res) => {
  try {
    const { status, localMcpVersion, localSkillVersion, errorCode, errorMessage } = req.body || {};
    const data = recordUpdateResult({
      userId: req.user.id,
      intentId: req.params.id,
      status,
      localMcpVersion,
      localSkillVersion,
      errorCode,
      errorMessage
    });
    res.json({ success: true, data });
  } catch (error) {
    sendAgentUpdateError(res, error);
  }
});

router.get('/git-provider/health', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const provider = GitLabProvider.fromEnvironment();
    const health = await provider.healthCheck();
    res.json({ success: true, data: health });
  } catch (error) {
    const status = error.code === 'GIT_PROVIDER_NOT_CONFIGURED' ? 503 : 502;
    res.status(status).json({
      success: false,
      code: error.code || 'GIT_PROVIDER_UNAVAILABLE',
      message: error.message || 'Git Provider 当前不可用'
    });
  }
});

router.get('/skill-package', requireAuth, (req, res) => {
  const skillDir = configuredSkillDir();
  if (!skillDir && !req.query.bootstrapId) {
    return res.status(503).json({ success: false, code: 'SKILL_DISTRIBUTION_UNAVAILABLE', message: 'Skill 分发目录未配置' });
  }
  const buffer = req.query.bootstrapId
    ? readSnapshotArtifact(req.query.bootstrapId, 'skill')
    : packageBuffer(skillDir, SKILL_NAME);
  if (!buffer) {
    return res.status(410).json({ success: false, code: 'BOOTSTRAP_ARTIFACT_UNAVAILABLE', message: 'Bootstrap 会话制品不存在或已失效' });
  }
  sendZipBuffer(res, `${SKILL_NAME}.zip`, buffer);
});

router.get('/mcp-package', requireAuth, (req, res) => {
  const mcpDir = configuredMcpDir();
  if (!mcpDir && !req.query.bootstrapId) {
    return res.status(503).json({ success: false, code: 'MCP_DISTRIBUTION_UNAVAILABLE', message: 'MCP 分发目录不可用' });
  }
  const buffer = req.query.bootstrapId
    ? readSnapshotArtifact(req.query.bootstrapId, 'mcp')
    : packageBuffer(mcpDir, 'fuxi-platform-mcp');
  if (!buffer) {
    return res.status(410).json({ success: false, code: 'BOOTSTRAP_ARTIFACT_UNAVAILABLE', message: 'Bootstrap 会话制品不存在或已失效' });
  }
  sendZipBuffer(res, 'fuxi-platform-mcp.zip', buffer);
});

module.exports = router;
