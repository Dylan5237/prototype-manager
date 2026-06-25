const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nvwa-secret-key-change-in-production';
const PREVIEW_COOKIE_NAME = 'fuxi_token';

function generateToken(user) {
  // user.role 可能是 JSON 数组字符串或普通字符串
  let roles = user.role;
  if (typeof roles === 'string') {
    try {
      roles = JSON.parse(roles);
    } catch (e) {
      roles = [roles];
    }
  }
  return jwt.sign(
    { id: user.id, username: user.username, roles },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 生成长期有效的分享 token（用于免登录查看链接）
function generateShareToken(user) {
  let roles = user.role;
  if (typeof roles === 'string') {
    try {
      roles = JSON.parse(roles);
    } catch (e) {
      roles = [roles];
    }
  }
  return jwt.sign(
    { id: user.id, username: user.username, roles },
    JWT_SECRET,
    { expiresIn: '365d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/**
 * 简单解析请求中的 Cookie 头
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) {
    return cookies;
  }
  cookieHeader.split(';').forEach(pair => {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) return;
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (name) cookies[name] = value;
  });
  return cookies;
}

/**
 * 序列化 Set-Cookie 响应头
 */
function serializeCookie(name, value, options = {}) {
  let header = `${name}=${encodeURIComponent(value)}`;
  if (options.Path) header += `; Path=${options.Path}`;
  if (options.HttpOnly) header += '; HttpOnly';
  if (options.SameSite) header += `; SameSite=${options.SameSite}`;
  if (options.MaxAge != null) header += `; Max-Age=${options.MaxAge}`;
  if (options.Secure) header += '; Secure';
  return header;
}

function requireAuth(req, res, next) {
  let token = null;
  let tokenSource = null;
  const authHeader = req.headers.authorization;
  const cookies = parseCookies(req.headers.cookie);

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
    tokenSource = 'header';
  } else if (req.query && req.query.token) {
    // 支持通过 URL query 传递 token（如预览页面在新窗口打开）
    token = req.query.token;
    tokenSource = 'query';
  } else if (cookies[PREVIEW_COOKIE_NAME]) {
    // 支持通过 Cookie 传递 token（解决预览页内跳转丢失 query token 的问题）
    token = cookies[PREVIEW_COOKIE_NAME];
    tokenSource = 'cookie';
  }

  if (!token) {
    return res.status(401).json({ success: false, message: '未登录' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: '登录已过期' });
  }

  // 兼容旧 token：如果没有 roles 字段，从 role 字段构造
  if (!decoded.roles) {
    decoded.roles = decoded.role ? [decoded.role] : [];
  }
  // 保留 role 字段作为第一个角色（向后兼容）
  decoded.role = decoded.roles[0] || '';

  // 对于预览路由，当 token 来自 query/header 时种下 Cookie，
  // 后续页面内跳转（如 wrapper 重定向）即可凭 Cookie 通过鉴权。
  if (
    (tokenSource === 'header' || tokenSource === 'query') &&
    req.originalUrl &&
    req.originalUrl.startsWith('/preview')
  ) {
    const maxAge = decoded.exp
      ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000))
      : 7 * 24 * 60 * 60;
    res.setHeader(
      'Set-Cookie',
      serializeCookie(PREVIEW_COOKIE_NAME, token, {
        Path: '/preview',
        HttpOnly: true,
        SameSite: 'Lax',
        MaxAge: maxAge
      })
    );
  }

  req.user = decoded;
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未登录' });
    }
    const userRoles = req.user.roles || [req.user.role];
    const hasRole = roles.some(r => userRoles.includes(r));
    if (!hasRole) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    next();
  };
}

module.exports = {
  generateToken,
  generateShareToken,
  verifyToken,
  requireAuth,
  requireRole,
  serializeCookie,
  PREVIEW_COOKIE_NAME
};
