const { query, queryOne, run } = require('../database/db');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// 解析 role 字段：从 JSON 数组字符串转为数组
// 为兼容早期 editor 数据，读取时统一映射为 uploader（显示层再展示为「编辑者」）
function parseRole(role) {
  if (!role) return ['viewer'];
  if (Array.isArray(role)) return role.map(r => r === 'editor' ? 'uploader' : r);
  try {
    const parsed = JSON.parse(role);
    if (Array.isArray(parsed)) return parsed.map(r => r === 'editor' ? 'uploader' : r);
  } catch (e) {}
  const single = role === 'editor' ? 'uploader' : role;
  return [single];
}

// 将用户对象中的 role 字段解析为数组
function formatUser(user) {
  if (!user) return user;
  return { ...user, role: parseRole(user.role) };
}

// 批量附加用户所属组信息
function attachGroupsToUsers(users) {
  if (!users || users.length === 0) return users;
  const userIds = users.map(u => u.id);
  const placeholders = userIds.map(() => '?').join(',');
  const rows = query(`
    SELECT m.user_id, g.id, g.name
    FROM user_group_members m
    JOIN user_groups g ON g.id = m.group_id
    WHERE m.user_id IN (${placeholders})
    ORDER BY g.name
  `, userIds);
  const map = {};
  rows.forEach(r => {
    if (!map[r.user_id]) map[r.user_id] = [];
    map[r.user_id].push({ id: r.id, name: r.name });
  });
  users.forEach(u => {
    u.groups = map[u.id] || [];
  });
  return users;
}

// 单用户附加所属组信息
function attachGroupsToUser(user) {
  if (!user) return user;
  const rows = query(`
    SELECT g.id, g.name
    FROM user_group_members m
    JOIN user_groups g ON g.id = m.group_id
    WHERE m.user_id = ?
    ORDER BY g.name
  `, [user.id]);
  user.groups = rows.map(r => ({ id: r.id, name: r.name }));
  return user;
}

function createUser({ username, password, nickname, role }) {
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const now = new Date().toISOString();
  // role 参数可以是数组或字符串，保存时 editor 也统一存为 uploader
  const roleArray = (Array.isArray(role) ? role : [role || 'viewer']).map(r => r === 'editor' ? 'uploader' : r);
  const roleStr = JSON.stringify(roleArray);
  run(
    `INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    [username, passwordHash, nickname || username, roleStr, now]
  );
  const user = formatUser(queryOne(`SELECT id, username, nickname, role, created_at FROM users WHERE username = ?`, [username]));
  return attachGroupsToUser(user);
}

function findUserByUsername(username) {
  return formatUser(queryOne(`SELECT * FROM users WHERE username = ?`, [username]));
}

function findUserById(id) {
  return formatUser(queryOne(`SELECT id, username, nickname, role, created_at FROM users WHERE id = ?`, [id]));
}

function getAllUsers() {
  const users = query(`SELECT id, username, nickname, role, created_at FROM users ORDER BY id`).map(formatUser);
  return attachGroupsToUsers(users);
}

function searchUsers(keyword) {
  const like = keyword ? `%${keyword}%` : '%';
  const users = query(`
    SELECT id, username, nickname, role, created_at
    FROM users
    WHERE username LIKE ? OR nickname LIKE ?
    ORDER BY id
    LIMIT 50
  `, [like, like]).map(formatUser);
  return attachGroupsToUsers(users);
}

function updateUser(id, { nickname, role, password }) {
  const fields = [];
  const values = [];
  if (nickname !== undefined) {
    fields.push('nickname = ?');
    values.push(nickname);
  }
  if (role !== undefined) {
    const roleArray = (Array.isArray(role) ? role : [role]).map(r => r === 'editor' ? 'uploader' : r);
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
  return attachGroupsToUser(findUserById(id));
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

function findUserByIdWithGroups(id) {
  return attachGroupsToUser(findUserById(id));
}

module.exports = {
  createUser,
  findUserByUsername,
  findUserById,
  findUserByIdWithGroups,
  getAllUsers,
  searchUsers,
  updateUser,
  deleteUser,
  verifyPassword,
  initDefaultAdmin,
  initGuestUser
};
