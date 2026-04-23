const express = require('express');
const router = express.Router();
const { generateToken, requireAuth, requireRole } = require('../middleware/auth');
const { createUser, findUserByUsername, findUserById, getAllUsers, verifyPassword } = require('../services/db-users');

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

module.exports = router;
