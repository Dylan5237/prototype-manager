const crypto = require('crypto');
const { query, queryOne, run } = require('../database/db');

const CONNECT_CODE_TTL_MS = 20 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// 生成一次性连接码。只返回明文；库里只保存哈希。
function createConnectCode(userId) {
  const code = randomToken(24);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_MS).toISOString();
  run(
    `INSERT INTO mcp_connect_codes (code_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    [sha256(code), userId, now, expiresAt]
  );
  return { code, expiresAt };
}

// 校验并消费连接码。返回 userId 或 null；原因写入 reason。
function consumeConnectCode(code) {
  if (!code) return { ok: false, reason: 'MISSING_CODE' };
  const row = queryOne(`SELECT * FROM mcp_connect_codes WHERE code_hash = ?`, [sha256(code)]);
  if (!row) return { ok: false, reason: 'INVALID_CODE' };
  if (row.used_at) return { ok: false, reason: 'CODE_ALREADY_USED' };
  if (Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: 'CODE_EXPIRED' };
  run(`UPDATE mcp_connect_codes SET used_at = ? WHERE code_hash = ?`, [new Date().toISOString(), sha256(code)]);
  return { ok: true, userId: row.user_id };
}

// 创建一条设备会话，返回明文 refresh token（仅此一次可见）。
function createSession(userId, deviceLabel) {
  const id = crypto.randomUUID();
  const refreshToken = randomToken(32);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  run(
    `INSERT INTO mcp_sessions (id, user_id, refresh_token_hash, device_label, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, sha256(refreshToken), deviceLabel || null, now, now, expiresAt]
  );
  return { id, refreshToken, expiresAt };
}

// 校验 refresh token，成功后轮换：新 token 写回，旧 token 立即失效；有效期滑动延长。
function rotateSession(refreshToken, deviceLabel) {
  if (!refreshToken) return { ok: false, reason: 'MISSING_REFRESH_TOKEN' };
  const row = queryOne(`SELECT * FROM mcp_sessions WHERE refresh_token_hash = ?`, [sha256(refreshToken)]);
  if (!row) return { ok: false, reason: 'INVALID_REFRESH_TOKEN' };
  if (row.revoked_at) return { ok: false, reason: 'SESSION_REVOKED' };
  if (Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: 'SESSION_EXPIRED' };
  const nextToken = randomToken(32);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  run(
    `UPDATE mcp_sessions SET refresh_token_hash = ?, last_used_at = ?, expires_at = ?, device_label = COALESCE(?, device_label) WHERE id = ?`,
    [sha256(nextToken), now, expiresAt, deviceLabel || null, row.id]
  );
  return { ok: true, sessionId: row.id, userId: row.user_id, refreshToken: nextToken, expiresAt };
}

function revokeSession(sessionId, userId = null) {
  const row = queryOne(`SELECT * FROM mcp_sessions WHERE id = ?`, [sessionId]);
  if (!row) return { ok: false, reason: 'SESSION_NOT_FOUND' };
  if (userId !== null && row.user_id !== userId) return { ok: false, reason: 'SESSION_NOT_OWNED' };
  run(`UPDATE mcp_sessions SET revoked_at = ? WHERE id = ?`, [new Date().toISOString(), sessionId]);
  return { ok: true };
}

function listSessions(userId = null) {
  const sql = userId === null
    ? `SELECT id, user_id, device_label, created_at, last_used_at, expires_at, revoked_at FROM mcp_sessions ORDER BY last_used_at DESC`
    : `SELECT id, user_id, device_label, created_at, last_used_at, expires_at, revoked_at FROM mcp_sessions WHERE user_id = ? ORDER BY last_used_at DESC`;
  const rows = userId === null ? query(sql) : query(sql, [userId]);
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    deviceLabel: r.device_label,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at
  }));
}

module.exports = {
  CONNECT_CODE_TTL_MS,
  createConnectCode,
  consumeConnectCode,
  createSession,
  rotateSession,
  revokeSession,
  listSessions
};
