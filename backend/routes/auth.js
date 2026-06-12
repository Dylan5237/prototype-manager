const express = require('express');
const router = express.Router();
const { generateToken, requireAuth, requireRole } = require('../middleware/auth');
const { createUser, findUserByUsername, findUserById, getAllUsers, updateUser, deleteUser, verifyPassword } = require('../services/db-users');

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
  
  const validRoles = ['admin', 'uploader', 'viewer'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: '无效的角色' });
  }
  
  try {
    const user = createUser({ username, password, nickname, role: role || 'viewer' });
    res.json({ success: true, data: user });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, message: '账号已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取当前用户
router.get('/me', requireAuth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ success: false, message: '用户不存在' });
  }
  res.json({ success: true, data: user });
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
  const { nickname, role, password } = req.body;
  const userId = parseInt(req.params.id);

  const user = findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  const validRoles = ['admin', 'uploader', 'viewer'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: '无效的角色' });
  }

  if (password && password.length < 4) {
    return res.status(400).json({ success: false, message: '密码至少4位' });
  }

  try {
    const updated = updateUser(userId, { nickname, role, password });
    res.json({ success: true, data: updated });
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

  // 检查是否唯一的admin
  const allUsers = getAllUsers();
  const adminCount = allUsers.filter(u => u.role === 'admin').length;
  if (user.role === 'admin' && adminCount <= 1) {
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
