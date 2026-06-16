const { query, queryOne, run } = require('../database/db');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// 解析 role 字段：从 JSON 数组字符串转为数组
function parseRole(role) {
  if (!role) return ['viewer'];
  if (Array.isArray(role)) return role;
  try {
    const parsed = JSON.parse(role);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return [role];
}

// 将用户对象中的 role 字段解析为数组
function formatUser(user) {
  if (!user) return user;
  return { ...user, role: parseRole(user.role) };
}

function createUser({ username, password, nickname, role }) {
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const now = new Date().toISOString();
  // role 参数可以是数组或字符串
  const roleArray = Array.isArray(role) ? role : [role || 'viewer'];
  const roleStr = JSON.stringify(roleArray);
  run(
    `INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    [username, passwordHash, nickname || username, roleStr, now]
  );
  return formatUser(queryOne(`SELECT id, username, nickname, role, created_at FROM users WHERE username = ?`, [username]));
}

function findUserByUsername(username) {
  return formatUser(queryOne(`SELECT * FROM users WHERE username = ?`, [username]));
}

function findUserById(id) {
  return formatUser(queryOne(`SELECT id, username, nickname, role, created_at FROM users WHERE id = ?`, [id]));
}

function getAllUsers() {
  return query(`SELECT id, username, nickname, role, created_at FROM users ORDER BY id`).map(formatUser);
}

function searchUsers(keyword) {
  const like = keyword ? `%${keyword}%` : '%';
  return query(`
    SELECT id, username, nickname, role, created_at
    FROM users
    WHERE username LIKE ? OR nickname LIKE ?
    ORDER BY id
    LIMIT 50
  `, [like, like]).map(formatUser);
}

function updateUser(id, { nickname, role, password }) {
  const fields = [];
  const values = [];
  if (nickname !== undefined) {
    fields.push('nickname = ?');
    values.push(nickname);
  }
  if (role !== undefined) {
    const roleArray = Array.isArray(role) ? role : [role];
    fields.push('role = ?');
    values.push(JSON.stringify(roleArray));
  }
  if (password !== undefined && password !== '') {
    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    fields.push('password_hash = ?');
    values.push(passwordHash);
  }
  if (fields.length === 0) return null;
  values.push(id);
  run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  return findUserById(id);
}

function deleteUser(id) {
  run(`DELETE FROM users WHERE id = ?`, [id]);
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

function initDefaultAdmin() {
  const admin = findUserByUsername('admin');
  if (!admin) {
    createUser({
      username: 'admin',
      password: 'admin123',
      nickname: '管理员',
      role: ['admin']
    });
    console.log('[系统] 默认管理员账号已创建: admin / admin123');
  }
}

function initGuestUser() {
  const guest = findUserByUsername('user');
  if (!guest) {
    createUser({
      username: 'user',
      password: '111111',
      nickname: '访客',
      role: ['viewer']
    });
    console.log('[系统] 默认访客账号已创建: user / 111111');
  }
}

module.exports = {
  createUser,
  findUserByUsername,
  findUserById,
  getAllUsers,
  searchUsers,
  updateUser,
  deleteUser,
  verifyPassword,
  initDefaultAdmin,
  initGuestUser
};
