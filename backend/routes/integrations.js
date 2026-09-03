const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const AdmZip = require('adm-zip');
const { requireAuth, requireRole, generateToken } = require('../middleware/auth');
const { findUserById } = require('../services/db-users');
const { createConnectCode } = require('../services/db-mcp-sessions');
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

const router = express.Router();
const SKILL_NAME = 'fuxi-prototype';
const EXCLUDED_NAMES = new Set([
  '.git', '.npmrc', '.credentials.json', 'node_modules', 'dist', 'build',
  'coverage', 'tests'
]);

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

function sendZip(res, filename, writer) {
  const zip = new AdmZip();
  writer(zip);
  const buffer = zip.toBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}

router.get('/agent-bootstrap', requireAuth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(401).json({ success: false, message: '用户不存在' });
  if (!configuredSkillDir()) {
    return res.status(503).json({
      success: false,
      code: 'SKILL_DISTRIBUTION_UNAVAILABLE',
      message: '平台尚未配置 FUXI_SKILL_DIR，无法生成完整的一键接入提示词'
    });
  }

  const expiresIn = 60 * 60;
  const token = generateToken(user, { expiresIn: `${expiresIn}s` });
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const connect = createConnectCode(user.id);
  const baseUrl = publicBaseUrl(req);
  const skillUrl = `${baseUrl}/api/integrations/skill-package`;
  const mcpUrl = `${baseUrl}/api/integrations/mcp-package`;
  const bootstrapManifest = {
    schema: 'fuxi-bootstrap/2',
    bootstrapId: crypto.randomUUID(),
    apiUrl: baseUrl,
    installToken: token,
    connectCode: connect.code,
    artifacts: {
      mcp: { url: mcpUrl, sha256: null, size: null },
      skill: { url: skillUrl, sha256: null, size: null }
    },
    client: { name: 'auto' }
  };
  const tokenExpiresLocal = formatLocalTime(expiresAt);
  const codeExpiresLocal = formatLocalTime(connect.expiresAt);
  const prompt = renderPromptTemplate('mcp.onboarding', {
    baseUrl,
    skillName: SKILL_NAME,
    skillUrl,
    mcpUrl,
    token,
    tokenExpiresLocal,
    connectCode: connect.code,
    codeExpiresLocal,
    bootstrapManifestJson: JSON.stringify(bootstrapManifest, null, 2)
  });

  res.json({
    success: true,
    data: {
      prompt,
      token,
      expiresIn,
      expiresAt,
      connectCode: connect.code,
      connectCodeExpiresAt: connect.expiresAt,
      bootstrapManifest,
      skillName: SKILL_NAME,
      skillUrl,
      mcpUrl,
      apiUrl: baseUrl
    }
  });
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
  if (!skillDir) {
    return res.status(503).json({ success: false, code: 'SKILL_DISTRIBUTION_UNAVAILABLE', message: 'Skill 分发目录未配置' });
  }
  sendZip(res, `${SKILL_NAME}.zip`, zip => addDirectory(zip, skillDir, SKILL_NAME));
});

router.get('/mcp-package', requireAuth, (req, res) => {
  const mcpDir = configuredMcpDir();
  if (!mcpDir) {
    return res.status(503).json({ success: false, code: 'MCP_DISTRIBUTION_UNAVAILABLE', message: 'MCP 分发目录不可用' });
  }
  sendZip(res, 'fuxi-platform-mcp.zip', zip => addDirectory(zip, mcpDir, 'fuxi-platform-mcp'));
});

module.exports = router;
