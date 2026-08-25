const express = require('express');
const fs = require('fs');
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

const router = express.Router();
const SKILL_NAME = 'fuxi-skyui-prototype';
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
  const tokenExpiresLocal = formatLocalTime(expiresAt);
  const codeExpiresLocal = formatLocalTime(connect.expiresAt);
  const prompt = `请自动接入伏羲原型体系，不要让我手工编辑配置文件。

本次接入只适用于同时满足以下条件的 AI 客户端：
- 支持 MCP stdio；
- 可以启动本地 Node.js 进程，且 Node.js >= 18；
- 允许 AI 在用户目录读写配置文件；
- 支持加载本地 Skill、Rules 或等价的 AI 指令目录。
如果当前客户端不满足任一条件，立即停止并明确报告不满足的条件，不要声称接入成功。

接入参数：
- API: ${baseUrl}
- Skill: ${SKILL_NAME}
- Skill 安装包: ${skillUrl}
- MCP 安装包: ${mcpUrl}
- 安装 token: ${token}
- 安装 token 过期时间: ${tokenExpiresLocal}（Asia/Shanghai）
- 一次性连接码: ${connect.code}
- 连接码过期时间: ${codeExpiresLocal}（Asia/Shanghai）

请严格按以下顺序执行；任何一步失败立即停止，不要声称接入成功：
1. 识别当前 AI 客户端名称、版本、操作系统、MCP stdio 配置机制和 Skill/Rules 目录，不假定 Cursor、Claude、Cline 或其他固定客户端，也不假定固定 JSON 路径。如果客户端没有可用的 Skill/Rules 机制，报告“当前客户端支持 MCP，但不具备可安装的 Skill 机制”。
2. 为 MCP、Skill、凭据和运行时选择用户级、持久化、非业务仓库路径；下载和解压只使用临时 staging 目录。所有路径必须解析为当前机器上的绝对路径，禁止把 <用户主目录>、<MCP解压目录>、<Skill目录> 或 <临时目录> 原样写入配置。
3. 备份现有 MCP 配置，只新增或更新伏羲条目，不删除其他 MCP，不覆盖其他客户端配置。使用 Authorization: Bearer <安装 token> 下载 MCP 和 Skill ZIP 到 staging；确认 HTTP 状态为 2xx、ZIP 有效且包含预期入口；如果响应提供 SHA-256、文件大小或版本信息，必须一并校验。禁止将安装 token、连接码或 refresh token 写入业务仓库、Skill 文件或日志。
4. 将校验通过的 MCP 安装到持久化目录，确认 fuxi-platform-mcp/src/launcher.js、server.js 和 package.json 存在。使用以下 stdio 配置启动稳定 launcher；尖括号路径必须替换为实际绝对路径：
     command: node
     args: [<持久化MCP目录>/fuxi-platform-mcp/src/launcher.js]
     env: {
       FUXI_API_URL: "${baseUrl}",
       FUXI_CONNECT_CODE: "${connect.code}",
       FUXI_CREDENTIALS_FILE: "<实际绝对路径>/.fuxi/mcp-credentials.json",
       FUXI_MCP_TARGET: "<持久化MCP目录>/fuxi-platform-mcp/src/server.js",
       FUXI_INSTALL_ROOT: "<实际绝对路径>/.fuxi/agent-runtime",
       FUXI_SKILL_TARGET: "<当前客户端实际Skill目录>/fuxi-skyui-prototype"
     }
5. 启动 launcher 后优先调用 check_connection。这一步会兑换一次性连接码、建立设备会话并将 refresh token 写入 FUXI_CREDENTIALS_FILE。在 check_connection 成功前，不要调用业务写入工具，不要上传项目或原型。连接码过期报告 AUTHENTICATION_FAILED，授权不足报告 AUTHORIZATION_REQUIRED。
6. 连接成功后，将 Skill ZIP 安装到当前客户端实际使用的 Skill/Rules 目录：先备份旧版本，先在临时目录完成校验，再原子替换，验证 ${SKILL_NAME}/SKILL.md 存在且可被客户端发现。安装失败时恢复备份。
7. 将稳定 launcher 保持在客户端的 stdio 配置中，并保留 FUXI_API_URL、FUXI_CREDENTIALS_FILE、FUXI_MCP_TARGET、FUXI_INSTALL_ROOT 和 FUXI_SKILL_TARGET。连接码兑换成功后删除 FUXI_CONNECT_CODE，不要持久化安装 token。
8. 重启或刷新 AI 客户端，再次调用 check_connection；确认 tools/list 包含 deliver_project，确认 ${SKILL_NAME} 可被发现和调用，确认其他已有 MCP 仍然正常。不能用当前会话中的一次成功代替重启后的验证。
9. 成功后先报告 AI 客户端、操作系统、MCP 实际安装路径、Skill 实际安装路径、MCP 连接结果、deliver_project 是否存在、Skill 是否发现成功以及后续是否由 launcher 接管更新。禁止回显安装 token、access token、refresh token、完整连接码、用户密码或凭据文件内容。然后引导我使用伏羲平台：
   【创建新原型】打开伏羲平台“原型列表”→点击“让AI创建原型”→在“新建原型”中输入需求或粘贴需求文件的完整本地路径→选择“快速验证”或“按SkyUI规范”→生成并复制完整提示词→将提示词发送给当前已接入的 AI 助手→回到伏羲查看原型预览、设计文档和版本历史。
   【修改独立原型】在“原型列表”打开未归属项目的原型详情→点击“让 AI 修改”→填写修改要求并选择版本策略→生成并复制完整提示词→发送给 AI→等待伏羲完成构建和静态交付检查→查看新的正式版本和预览；如果预览无法加载，再让 AI 排查后重新上传。
   【修改项目中的原型】如果原型已经绑定项目，进入顶部“项目”→打开所属项目→在项目菜单中选择目标原型→点击“让 AI 修改”→生成并复制完整提示词→发送给 AI→候选上传后由项目负责人预览并采用；未采用前不会改变正式版本。

恢复规则：需要客户端授权时只请求最小原生授权；refresh token 失效时保留旧安装并报告 AUTHENTICATION_FAILED；Skill 或 MCP 替换失败时恢复备份；任一步失败都不得声称接入成功。首次接入完成后，后续 MCP 和 Skill 更新由稳定 launcher 在 AI 客户端下次启动时处理，不要让我重复执行完整接入流程。`;

  res.json({
    success: true,
    data: {
      prompt,
      token,
      expiresIn,
      expiresAt,
      connectCode: connect.code,
      connectCodeExpiresAt: connect.expiresAt,
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
