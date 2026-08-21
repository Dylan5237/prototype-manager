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
  listPublishedReleases,
  getAvailableUpdates,
  createUpdateIntent,
  getUpdateIntent,
  claimUpdateIntent,
  recordUpdateResult
} = require('../services/db-agent-updates');

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

接入参数：
- API: ${baseUrl}
- 单一 Skill: ${SKILL_NAME}
- Skill 安装包: ${skillUrl}
- MCP 安装包: ${mcpUrl}
- 安装 token: ${token}
- 安装 token 过期时间: ${tokenExpiresLocal}（Asia/Shanghai）
- 一次性连接码: ${connect.code}
- 连接码过期时间: ${codeExpiresLocal}（Asia/Shanghai）

请严格按以下顺序执行；任何一步失败立即停止，不要声称接入成功：
1. 先识别当前 AI 客户端原生的 MCP 配置机制和本地工具目录，不假定固定 JSON 路径；创建临时安装目录，禁止把安装 token、连接码或 refresh token 写入业务仓库、Skill 文件或日志。
2. 使用 Authorization: Bearer <安装 token> 只下载 MCP ZIP 到临时目录并解压；确认 Node.js >=18。先不要安装 Skill，也不要调用任何业务工具。
3. 立即用下面的 stdio 配置启动 MCP，并优先调用 check_connection；这一步会兑换一次性连接码、建立设备会话、把 refresh token 写入 FUXI_CREDENTIALS_FILE。只有 check_connection 成功后才能继续：
     command: node
     args: [<MCP解压目录>/fuxi-platform-mcp/src/server.js]
     env: {
     FUXI_API_URL: "${baseUrl}",
     FUXI_CONNECT_CODE: "${connect.code}",
     FUXI_CREDENTIALS_FILE: "<用户主目录>/.fuxi/mcp-credentials.json"
     }
4. 连接成功后，使用安装 token 下载 Skill ZIP；将其中的 ${SKILL_NAME}/ 安装到原生 Skill 目录，先备份已有版本，再以临时目录完成替换，验证 SKILL.md 可发现。
5. 将 MCP ZIP 的正式目录接入 AI 客户端的 stdio 配置，保留 FUXI_API_URL 和 FUXI_CREDENTIALS_FILE，连接码只用于本次首次兑换；兑换成功后删除 FUXI_CONNECT_CODE，不要持久化安装 token。
6. 重启或刷新 AI 客户端，调用 check_connection，确认 tools/list 包含 deliver_project，再确认 ${SKILL_NAME} 可被发现和调用；不要用业务写入动作代替连接验证。
7. 成功后只报告安装位置、连接结果、Skill 状态和会话有效期，不回显完整安装 token、access token 或 refresh token。

恢复规则：需要客户端授权时只请求最小原生授权；权限拒绝报告 AUTHORIZATION_REQUIRED；连接码过期报告 AUTHENTICATION_FAILED 并让我回平台重新生成连接码；refresh token 失效时先保留旧安装并报告 AUTHENTICATION_FAILED；Skill 或 MCP 替换失败时恢复备份；任一步失败都不得声称接入成功。`;

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
  const status = error instanceof AgentUpdateError ? error.status : 500;
  res.status(status).json({
    success: false,
    code: error.code || 'AGENT_UPDATE_FAILED',
    message: error.message || '组件更新操作失败',
    ...(error.details && Object.keys(error.details).length ? { details: error.details } : {})
  });
}

// 发布不可变 stable release。当前只提供维护者 API，下载制品的真实发布接线后续补上。
router.post('/agent-releases', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const release = createRelease({ actorUserId: req.user.id, manifest: req.body && (req.body.manifest || req.body) });
    res.status(201).json({ success: true, data: release });
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
