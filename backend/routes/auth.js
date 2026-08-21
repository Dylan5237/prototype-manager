const express = require('express');
const router = express.Router();
const { generateToken, requireAuth, requireRole } = require('../middleware/auth');
const { createUser, findUserByUsername, findUserById, findUserByIdWithGroups, getAllUsers, updateUser, deleteUser, verifyPassword } = require('../services/db-users');
const { setGroupMembers } = require('../services/db-groups');
const { CONNECT_CODE_TTL_MS, createConnectCode, consumeConnectCode, createSession, rotateSession, revokeSession, listSessions } = require('../services/db-mcp-sessions');

// uploader 与 editor 等价，数据库统一保存为 uploader，显示层统一展示为「编辑者」
const VALID_ROLES = ['admin', 'uploader', 'viewer'];
const MCP_ACCESS_TTL_SECONDS = 60 * 60;

function normalizeRoles(role) {
  const arr = Array.isArray(role) ? role : [role];
  return arr.map(r => r === 'editor' ? 'uploader' : r);
}

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '账号和密码不能为空' });
  }

  const user = findUserByUsername(username);
  if (!user) {
    return res.status(401).json({ success: false, message: '账号或密码错误' });
  }

  if (!verifyPassword(user, password)) {
    return res.status(401).json({ success: false, message: '账号或密码错误' });
  }

  const token = generateToken(user);
  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role
      }
    }
  });
});

// 注册（仅admin）
router.post('/register', requireAuth, requireRole(['admin']), (req, res) => {
  const { username, password, nickname, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '账号和密码不能为空' });
  }

  if (password.length < 4) {
    return res.status(400).json({ success: false, message: '密码至少4位' });
  }

  const { groupIds } = req.body;

  // role 支持数组和单值
  const roleArray = normalizeRoles(Array.isArray(role) ? role : [role || 'viewer']);
  const invalidRole = roleArray.find(r => !VALID_ROLES.includes(r));
  if (invalidRole) {
    return res.status(400).json({ success: false, message: `无效的角色: ${invalidRole}` });
  }

  try {
    const user = createUser({ username, password, nickname, role: roleArray });
    if (groupIds !== undefined) {
      setGroupMembers(user.id, Array.isArray(groupIds) ? groupIds : []);
    }
    res.json({ success: true, data: findUserByIdWithGroups(user.id) });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, message: '账号已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取当前用户
router.get('/me', requireAuth, (req, res) => {
  const user = findUserByIdWithGroups(req.user.id);
  if (!user) {
    return res.status(401).json({ success: false, message: '用户不存在' });
  }
  res.json({ success: true, data: user });
});

// 生成短期 MCP 接入 token，避免用户向 AI 助手提供长期 JWT 或账号密码
router.get('/mcp-token', requireAuth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ success: false, message: '用户不存在' });
  }
  const expiresInSeconds = 60 * 60; // 1 小时
  const token = generateToken(user, { expiresIn: `${expiresInSeconds}s` });
  res.json({
    success: true,
    data: {
      token,
      expiresIn: expiresInSeconds,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    }
  });
});

// 生成一次性 MCP 连接码。用户在平台发起接入时调用，返回短命单次使用的连接码。
router.post('/mcp/connect-code', requireAuth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ success: false, message: '用户不存在' });
  }
  const { code, expiresAt } = createConnectCode(user.id);
  res.json({
    success: true,
    data: { code, expiresAt, expiresIn: CONNECT_CODE_TTL_MS / 1000 }
  });
});

// 用一次性连接码兑换 access token + refresh token，并登记设备会话。
router.post('/mcp/connect', (req, res) => {
  const { code, deviceLabel } = req.body || {};
  const consumed = consumeConnectCode(code);
  if (!consumed.ok) {
    const statusByReason = {
      MISSING_CODE: 400,
      INVALID_CODE: 401,
      CODE_ALREADY_USED: 409,
      CODE_EXPIRED: 401
    };
    return res.status(statusByReason[consumed.reason] || 401).json({
      success: false,
      code: consumed.reason,
      message: consumed.reason === 'INVALID_CODE' || consumed.reason === 'MISSING_CODE' ? '连接码无效' :
        consumed.reason === 'CODE_ALREADY_USED' ? '连接码已被使用' : '连接码已过期'
    });
  }
  const user = findUserById(consumed.userId);
  if (!user) {
    return res.status(401).json({ success: false, code: 'INVALID_CODE', message: '用户不存在' });
  }
  const session = createSession(user.id, deviceLabel);
  const accessToken = generateToken(user, { expiresIn: `${MCP_ACCESS_TTL_SECONDS}s` });
  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.id,
      expiresIn: MCP_ACCESS_TTL_SECONDS,
      expiresAt: new Date(Date.now() + MCP_ACCESS_TTL_SECONDS * 1000).toISOString(),
      sessionExpiresAt: session.expiresAt
    }
  });
});

// 用 refresh token 换新 access token，refresh token 轮换并滑动延长会话有效期。
router.post('/mcp/refresh', (req, res) => {
  const { refreshToken, deviceLabel } = req.body || {};
  const rotated = rotateSession(refreshToken, deviceLabel);
  if (!rotated.ok) {
    return res.status(401).json({
      success: false,
      code: rotated.reason,
      message: rotated.reason === 'SESSION_REVOKED' ? '会话已撤销' :
        rotated.reason === 'SESSION_EXPIRED' ? '会话已过期，请重新接入' :
        'refresh token 无效'
    });
  }
  const user = findUserById(rotated.userId);
  if (!user) {
    return res.status(401).json({ success: false, code: 'INVALID_REFRESH_TOKEN', message: '用户不存在' });
  }
  const accessToken = generateToken(user, { expiresIn: `${MCP_ACCESS_TTL_SECONDS}s` });
  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: rotated.refreshToken,
      sessionId: rotated.sessionId,
      expiresIn: MCP_ACCESS_TTL_SECONDS,
      expiresAt: new Date(Date.now() + MCP_ACCESS_TTL_SECONDS * 1000).toISOString(),
      sessionExpiresAt: rotated.expiresAt
    }
  });
});

// 查看 MCP 连接情况：admin 看全部，普通用户只看自己的。
router.get('/mcp/sessions', requireAuth, (req, res) => {
  const isAdmin = (req.user.roles || []).includes('admin');
  const sessions = listSessions(isAdmin ? null : req.user.id);
  res.json({ success: true, data: sessions });
});

// 撤销一条 MCP 会话：admin 可撤销任意，普通用户只能撤销自己的。
router.delete('/mcp/sessions/:id', requireAuth, (req, res) => {
  const isAdmin = (req.user.roles || []).includes('admin');
  const result = revokeSession(req.params.id, isAdmin ? null : req.user.id);
  if (!result.ok) {
    return res.status(result.reason === 'SESSION_NOT_FOUND' ? 404 : 403).json({
      success: false,
      code: result.reason,
      message: result.reason === 'SESSION_NOT_FOUND' ? '会话不存在' : '无权撤销该会话'
    });
  }
  res.json({ success: true, message: '会话已撤销' });
});

// 用户列表（仅admin）
router.get('/users', requireAuth, requireRole(['admin']), (req, res) => {
  const users = getAllUsers();
  res.json({ success: true, data: users });
});

// 搜索用户（所有登录用户可用，用于分享时选择用户）
router.get('/users/search', requireAuth, (req, res) => {
  const { keyword } = req.query;
  const { searchUsers } = require('../services/db-users');
  const users = searchUsers(keyword);
  res.json({ success: true, data: users });
});

// 更新用户（仅admin）
router.put('/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
  console.log('[PUT /users/:id] params:', req.params, 'body:', req.body);
  const { nickname, role, password, groupIds } = req.body;
  const userId = parseInt(req.params.id);

  const user = findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  // role 支持数组和单值
  if (role !== undefined) {
    const roleArray = normalizeRoles(Array.isArray(role) ? role : [role]);
    const invalidRole = roleArray.find(r => !VALID_ROLES.includes(r));
    if (invalidRole) {
      return res.status(400).json({ success: false, message: `无效的角色: ${invalidRole}` });
    }
  }

  if (password && password.length < 4) {
    return res.status(400).json({ success: false, message: '密码至少4位' });
  }

  try {
    const updated = updateUser(userId, { nickname, role: role !== undefined ? role : user.role, password });
    if (groupIds !== undefined) {
      setGroupMembers(userId, Array.isArray(groupIds) ? groupIds : []);
    }
    res.json({ success: true, data: findUserByIdWithGroups(userId) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除用户（仅admin）
router.delete('/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
  console.log('[DELETE /users/:id] params:', req.params);
  const userId = parseInt(req.params.id);

  // 不能删除自己
  if (userId === req.user.id) {
    return res.status(400).json({ success: false, message: '不能删除当前登录账号' });
  }

  const user = findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  // 检查是否唯一的admin（role 现在是数组）
  const allUsers = getAllUsers();
  const adminCount = allUsers.filter(u => Array.isArray(u.role) ? u.role.includes('admin') : u.role === 'admin').length;
  const targetIsAdmin = Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin';
  if (targetIsAdmin && adminCount <= 1) {
    return res.status(400).json({ success: false, message: '系统中至少需要保留一个管理员' });
  }

  try {
    deleteUser(userId);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
