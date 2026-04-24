const { query, queryOne, run } = require('../database/db');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

function createUser({ username, password, nickname, role }) {
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const now = new Date().toISOString();
  run(
    `INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    [username, passwordHash, nickname || username, role || 'viewer', now]
  );
  return queryOne(`SELECT id, username, nickname, role, created_at FROM users WHERE username = ?`, [username]);
}

function findUserByUsername(username) {
  return queryOne(`SELECT * FROM users WHERE username = ?`, [username]);
}

function findUserById(id) {
  return queryOne(`SELECT id, username, nickname, role, created_at FROM users WHERE id = ?`, [id]);
}

function getAllUsers() {
  return query(`SELECT id, username, nickname, role, created_at FROM users ORDER BY id`);
}

function updateUser(id, { nickname, role, password }) {
  const fields = [];
  const values = [];
  if (nickname !== undefined) {
    fields.push('nickname = ?');
    values.push(nickname);
  }
  if (role !== undefined) {
    fields.push('role = ?');
    values.push(role);
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
      role: 'admin'
    });
    console.log('[系统] 默认管理员账号已创建: admin / admin123');
  }
}

module.exports = {
  createUser,
  findUserByUsername,
  findUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  verifyPassword,
  initDefaultAdmin
};
