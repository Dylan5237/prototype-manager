const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  createSession,
  rotateSession,
  revokeSession
} = require('../services/db-mcp-sessions');

let tempRoot;
const timestamp = '2026-09-15T00:00:00.000Z';

function seedUser() {
  database.run(
    `INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'panying', 'hash', '盘英', '["uploader"]', timestamp]
  );
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-sessions-'));
  await database.initDatabase({ path: path.join(tempRoot, 'sessions.db'), persist: false });
  seedUser();
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('previous refresh token remains usable after a successful rotation', () => {
  const session = createSession(1, 'DESKTOP-N09059V (win32)');
  const first = rotateSession(session.refreshToken, 'DESKTOP-N09059V (win32)');
  assert.equal(first.ok, true);
  assert.notEqual(first.refreshToken, session.refreshToken);

  const retryWithPrevious = rotateSession(session.refreshToken, 'DESKTOP-N09059V (win32)');
  assert.equal(retryWithPrevious.ok, true);
  assert.equal(retryWithPrevious.sessionId, session.id);
  assert.notEqual(retryWithPrevious.refreshToken, first.refreshToken);
});

test('stale previous-slot reuse does not revoke the current session', () => {
  const session = createSession(1, 'device');
  const t0 = session.refreshToken;
  const first = rotateSession(t0, 'device');
  const second = rotateSession(first.refreshToken, 'device');
  assert.equal(second.ok, true);

  const stale = rotateSession(t0, 'device');
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'INVALID_REFRESH_TOKEN');

  const currentStillWorks = rotateSession(second.refreshToken, 'device');
  assert.equal(currentStillWorks.ok, true);
  assert.equal(currentStillWorks.sessionId, session.id);
});

test('unknown refresh token does not revoke a healthy session', () => {
  const session = createSession(1, 'device');
  const rotated = rotateSession(session.refreshToken, 'device');
  assert.equal(rotated.ok, true);

  const unknown = rotateSession('a'.repeat(64), 'device');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'INVALID_REFRESH_TOKEN');

  const current = rotateSession(rotated.refreshToken, 'device');
  assert.equal(current.ok, true);
});

test('revoked session stays revoked for both current and previous tokens', () => {
  const session = createSession(1, 'device');
  const rotated = rotateSession(session.refreshToken, 'device');
  const revoked = revokeSession(session.id, 1);
  assert.equal(revoked.ok, true);

  assert.equal(rotateSession(rotated.refreshToken, 'device').reason, 'SESSION_REVOKED');
  assert.equal(rotateSession(session.refreshToken, 'device').reason, 'SESSION_REVOKED');
});
