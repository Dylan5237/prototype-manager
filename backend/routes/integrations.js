const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { requireAuth, generateToken } = require('../middleware/auth');
const { findUserById } = require('../services/db-users');
const { createConnectCode } = require('../services/db-mcp-sessions');

const router = express.Router();
const SKILL_NAME = 'fuxi-skyui-prototype';
const EXCLUDED_NAMES = new Set([
  '.git', '.npmrc', '.credentials.json', 'node_modules', 'dist', 'build',
  'coverage', 'tests'
]);

function publicBaseUrl(req) {
  const forwarded = req.headers['x-forwarded-proto'];
  const protocol = forwarded ? String(forwarded).split(',')[0].trim() : req.protocol;
  return `${protocol}://${req.get('host')}`;
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
  const prompt = `请自动接入伏羲原型体系，不要让我手工编辑配置文件。

接入参数：
- API: ${baseUrl}
- 单一 Skill: ${SKILL_NAME}
- Skill 安装包: ${skillUrl}
- MCP 安装包: ${mcpUrl}
- 安装 token: ${token}
- 安装 token 过期时间: ${expiresAt}
- 一次性连接码: ${connect.code}
- 连接码过期时间: ${connect.expiresAt}

请执行：
1. 识别当前 AI 客户端原生的 Skill 安装目录和 MCP 配置机制，不假定固定 JSON 路径。
2. 使用 Authorization: Bearer <安装 token> 下载两个 ZIP；安装 token 只用于下载，禁止写入业务仓库。
3. 将 Skill ZIP 中的 ${SKILL_NAME}/ 安装到原生 Skill 目录，验证 SKILL.md 可发现；已安装时原位安全更新。
4. 将 MCP ZIP 解压到客户端本地工具目录，确认 Node.js >=18，并用 stdio 接入：
   command: node
   args: [<MCP解压目录>/fuxi-platform-mcp/src/server.js]
   env: {
     FUXI_API_URL: "${baseUrl}",
     FUXI_CONNECT_CODE: "${connect.code}",
     FUXI_CREDENTIALS_FILE: "<用户主目录>/.fuxi/mcp-credentials.json"
   }
5. 调用 fuxi-platform 的 check_connection，确认 tools/list 包含 deliver_project。MCP 首次启动会用连接码兑换 access token + refresh token，并把 refresh token 写入 FUXI_CREDENTIALS_FILE；之后每次启动从该文件恢复会话，access token 过期时自动刷新，无需再次人工配置，再确认 ${SKILL_NAME} 可被调用。
6. 成功后只报告安装位置、连接结果、Skill 状态和会话有效期，不回显完整 token 或 refresh token。

恢复规则：需要客户端授权时只请求最小原生授权；权限拒绝报告 AUTHORIZATION_REQUIRED；连接码或 refresh token 过期报告 AUTHENTICATION_FAILED 并让我回平台重新生成连接码；任一步失败都不得声称接入成功。`;

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
