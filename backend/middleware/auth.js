const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nvwa-secret-key-change-in-production';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    // 支持通过 URL query 传递 token（如预览页面在新窗口打开）
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: '未登录' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: '登录已过期' });
  }

  req.user = decoded;
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    next();
  };
}

module.exports = {
  generateToken,
  verifyToken,
  requireAuth,
  requireRole
};
