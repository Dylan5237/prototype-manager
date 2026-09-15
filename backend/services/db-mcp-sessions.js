const crypto = require('crypto');
const { query, queryOne, run } = require('../database/db');

const CONNECT_CODE_TTL_MS = 20 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// 与 MCP access token TTL 对齐：期间内不再轮换，避免同机多 MCP 进程互相作废。
const REFRESH_ROTATION_DEBOUNCE_MS = 60 * 60 * 1000;
// 旧 refresh token 短宽限：只让刚被轮换掉的 token 在竞态窗口内兑回当前 token，不按用户族吊销。
const REFRESH_REUSE_GRACE_MS = 2 * 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function tokenSecret() {
  return process.env.JWT_SECRET || 'nvwa-secret-key-change-in-production';
}

function encryptRefreshToken(value) {
  const key = crypto.createHash('sha256').update(tokenSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptRefreshToken(payload) {
  if (!payload) return null;
  try {
    const buffer = Buffer.from(String(payload), 'base64');
    if (buffer.length < 29) return null;
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const key = crypto.createHash('sha256').update(tokenSecret()).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (error) {
    return null;
  }
}

function sessionExpiresAt(nowMs = Date.now()) {
  return new Date(nowMs + SESSION_TTL_MS).toISOString();
}

function touchSession(row, deviceLabel, nowIso, expiresAt) {
  run(
    `UPDATE mcp_sessions SET last_used_at = ?, expires_at = ?, device_label = COALESCE(?, device_label) WHERE id = ?`,
    [nowIso, expiresAt, deviceLabel || null, row.id]
  );
}

function sessionResult(row, refreshToken, expiresAt) {
  return { ok: true, sessionId: row.id, userId: row.user_id, refreshToken, expiresAt };
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
// 只插入新行，绝不撤销同一用户的既有设备会话。
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

function sessionFailure(row) {
  if (!row) return { ok: false, reason: 'INVALID_REFRESH_TOKEN' };
  if (row.revoked_at) return { ok: false, reason: 'SESSION_REVOKED' };
  if (Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: 'SESSION_EXPIRED' };
  return null;
}

function mintRotatedToken(row, deviceLabel, nowMs) {
  const nextToken = randomToken(32);
  const now = new Date(nowMs).toISOString();
  const expiresAt = sessionExpiresAt(nowMs);
  run(
    `UPDATE mcp_sessions
        SET previous_refresh_token_hash = refresh_token_hash,
            refresh_token_hash = ?,
            current_refresh_token_enc = ?,
            rotated_at = ?,
            last_used_at = ?,
            expires_at = ?,
            device_label = COALESCE(?, device_label)
      WHERE id = ?`,
    [sha256(nextToken), encryptRefreshToken(nextToken), now, now, expiresAt, deviceLabel || null, row.id]
  );
  return sessionResult(row, nextToken, expiresAt);
}

// 校验 refresh token。当前 token 在 debounce 窗口内不轮换；刚被换下的旧 token
// 仅在短宽限内兑回同一会话的当前 token。过期重放只返回 INVALID，不吊销会话族。
function rotateSession(refreshToken, deviceLabel) {
  if (!refreshToken) return { ok: false, reason: 'MISSING_REFRESH_TOKEN' };
  const tokenHash = sha256(refreshToken);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const expiresAt = sessionExpiresAt(nowMs);

  const current = queryOne(`SELECT * FROM mcp_sessions WHERE refresh_token_hash = ?`, [tokenHash]);
  if (current) {
    const failed = sessionFailure(current);
    if (failed) return failed;
    const rotatedAtMs = Date.parse(current.rotated_at || '') || 0;
    if (rotatedAtMs && nowMs - rotatedAtMs < REFRESH_ROTATION_DEBOUNCE_MS) {
      touchSession(current, deviceLabel, now, expiresAt);
      return sessionResult(current, refreshToken, expiresAt);
    }
    return mintRotatedToken(current, deviceLabel, nowMs);
  }

  const previous = queryOne(`SELECT * FROM mcp_sessions WHERE previous_refresh_token_hash = ?`, [tokenHash]);
  if (!previous) return { ok: false, reason: 'INVALID_REFRESH_TOKEN' };
  const failed = sessionFailure(previous);
  if (failed) return failed;
  const rotatedAtMs = Date.parse(previous.rotated_at || '') || 0;
  if (!rotatedAtMs || nowMs - rotatedAtMs > REFRESH_REUSE_GRACE_MS) {
    return { ok: false, reason: 'INVALID_REFRESH_TOKEN' };
  }
  const currentToken = decryptRefreshToken(previous.current_refresh_token_enc);
  if (!currentToken) return { ok: false, reason: 'INVALID_REFRESH_TOKEN' };
  touchSession(previous, deviceLabel, now, expiresAt);
  return sessionResult(previous, currentToken, expiresAt);
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
    ? `SELECT id, user_id, device_label, created_at, last_used_at, expires_at, revoked_at,
         mcp_version, skill_version, runtime_version, platform, last_reported_at
       FROM mcp_sessions ORDER BY last_used_at DESC`
    : `SELECT id, user_id, device_label, created_at, last_used_at, expires_at, revoked_at,
         mcp_version, skill_version, runtime_version, platform, last_reported_at
       FROM mcp_sessions WHERE user_id = ? ORDER BY last_used_at DESC`;
  const rows = userId === null ? query(sql) : query(sql, [userId]);
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    deviceLabel: r.device_label,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    mcpVersion: r.mcp_version || null,
    skillVersion: r.skill_version || null,
    runtimeVersion: r.runtime_version || null,
    platform: r.platform || null,
    lastReportedAt: r.last_reported_at || null
  }));
}

module.exports = {
  CONNECT_CODE_TTL_MS,
  SESSION_TTL_MS,
  REFRESH_ROTATION_DEBOUNCE_MS,
  REFRESH_REUSE_GRACE_MS,
  createConnectCode,
  consumeConnectCode,
  createSession,
  rotateSession,
  revokeSession,
  listSessions
};
