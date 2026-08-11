const express = require('express');
const router = express.Router();
const { generateToken, requireAuth, requireRole } = require('../middleware/auth');
const { createUser, findUserByUsername, findUserById, findUserByIdWithGroups, getAllUsers, updateUser, deleteUser, verifyPassword } = require('../services/db-users');
const { setGroupMembers } = require('../services/db-groups');

// uploader 与 editor 等价，数据库统一保存为 uploader，显示层统一展示为「编辑者」
const VALID_ROLES = ['admin', 'uploader', 'viewer'];

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
