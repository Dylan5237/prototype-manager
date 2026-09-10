const crypto = require('crypto');
const { queryOne, run } = require('../database/db');

const BOOTSTRAP_SESSION_TTL_MS = 15 * 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomCredential() {
  return crypto.randomBytes(32).toString('base64url');
}

function createBootstrapSession({ userId, apiUrl, client }) {
  const credential = randomCredential();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + BOOTSTRAP_SESSION_TTL_MS).toISOString();
  const bootstrapId = crypto.randomUUID();
  run(
    `DELETE FROM bootstrap_sessions WHERE expires_at <= ?`,
    [now]
  );
  run(
    `INSERT INTO bootstrap_sessions
      (credential_hash, user_id, bootstrap_id, api_url, client_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sha256(credential), userId, bootstrapId, String(apiUrl).replace(/\/+$/, ''), String(client || ''), now, expiresAt]
  );
  return { credential, bootstrapId, apiUrl: String(apiUrl).replace(/\/+$/, ''), client: String(client || ''), createdAt: now, expiresAt };
}

function readBootstrapSession(credential) {
  if (typeof credential !== 'string' || !credential.trim()) {
    return { ok: false, reason: 'MISSING_BOOTSTRAP_SESSION' };
  }
  const row = queryOne(
    `SELECT credential_hash, user_id, bootstrap_id, api_url, client_name, created_at, expires_at
       FROM bootstrap_sessions WHERE credential_hash = ?`,
    [sha256(credential)]
  );
  if (!row) return { ok: false, reason: 'INVALID_BOOTSTRAP_SESSION' };
  if (Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: 'BOOTSTRAP_SESSION_EXPIRED' };
  return {
    ok: true,
    userId: Number(row.user_id),
    bootstrapId: row.bootstrap_id,
    apiUrl: row.api_url,
    client: row.client_name || '',
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

module.exports = {
  BOOTSTRAP_SESSION_TTL_MS,
  createBootstrapSession,
  readBootstrapSession
};
