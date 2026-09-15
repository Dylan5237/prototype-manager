const fs = require('node:fs');
const path = require('node:path');
const { writeJsonAtomic } = require('./atomic-write');

const ACCESS_REFRESH_SKEW_MS = 5000;
const DEAD_SESSION_CODES = new Set(['INVALID_REFRESH_TOKEN', 'SESSION_REVOKED', 'SESSION_EXPIRED']);
const RECONNECT_HINT = '设备会话已失效，请在伏羲平台重新生成连接码并完成接入';

function nowIso() {
  return new Date().toISOString();
}

function normalizeApiUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parseAccessExpiresAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 1e12) return asNumber;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function isDeadSessionCode(code) {
  return DEAD_SESSION_CODES.has(String(code || ''));
}

function accessTokenStillValid(credentials, now = Date.now()) {
  if (!credentials || typeof credentials.accessToken !== 'string' || !credentials.accessToken) return false;
  return parseAccessExpiresAt(credentials.accessExpiresAt) > now + ACCESS_REFRESH_SKEW_MS;
}

function readCredentialFile(file) {
  try {
    const credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
    return credentials && typeof credentials === 'object' ? credentials : null;
  } catch (error) {
    return null;
  }
}

function writeCredentialFile(file, payload) {
  writeJsonAtomic(file, payload, { mode: 0o600 });
}

function sessionCredentialPayload({
  apiUrl,
  refreshToken,
  sessionId,
  sessionExpiresAt,
  accessToken,
  accessExpiresAt,
  deviceLabel,
  extra = {}
}) {
  const payload = {
    ...extra,
    apiUrl: normalizeApiUrl(apiUrl),
    refreshToken,
    sessionId: sessionId || null,
    sessionExpiresAt: sessionExpiresAt || null,
    deviceLabel,
    updatedAt: nowIso()
  };
  if (typeof accessToken === 'string' && accessToken) {
    payload.accessToken = accessToken;
    payload.accessExpiresAt = accessExpiresAt || undefined;
  }
  delete payload.reconnectRequired;
  delete payload.authentication;
  return payload;
}

function tombstonePayload({ apiUrl, sessionId, reason }) {
  return {
    apiUrl: normalizeApiUrl(apiUrl),
    sessionId: sessionId || null,
    authentication: reason,
    reconnectRequired: true,
    updatedAt: nowIso()
  };
}

function refreshLockFile(credentialsFile) {
  return `${path.resolve(credentialsFile)}.refresh.lock`;
}

module.exports = {
  ACCESS_REFRESH_SKEW_MS,
  DEAD_SESSION_CODES,
  RECONNECT_HINT,
  normalizeApiUrl,
  parseAccessExpiresAt,
  isDeadSessionCode,
  accessTokenStillValid,
  readCredentialFile,
  writeCredentialFile,
  sessionCredentialPayload,
  tombstonePayload,
  refreshLockFile
};
