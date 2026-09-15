'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  createConnectCode,
  consumeConnectCode,
  createSession,
  rotateSession,
  revokeSession,
  listSessions,
  REFRESH_REUSE_GRACE_MS
} = require('../services/db-mcp-sessions');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-sessions-'));
  await database.initDatabase({ path: path.join(tempRoot, 'sessions.db'), persist: false, mode: 'writer' });
  database.run(
    'INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [1, 'panying', 'hash', '盘盈', '["uploader"]', '2026-09-15T00:00:00.000Z']
  );
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('connect mints a sibling session and does not revoke the live device', () => {
  const first = createSession(1, 'DESKTOP-N09059V (win32)');
  const firstCode = createConnectCode(1);
  const consumed = consumeConnectCode(firstCode.code);
  assert.equal(consumed.ok, true);
  const second = createSession(consumed.userId, 'DESKTOP-N09059V (win32)');
  assert.notEqual(second.id, first.id);

  const replayFirst = rotateSession(first.refreshToken, 'DESKTOP-N09059V (win32)');
  assert.equal(replayFirst.ok, true);
  assert.equal(replayFirst.sessionId, first.id);
  const replaySecond = rotateSession(second.refreshToken, 'DESKTOP-N09059V (win32)');
  assert.equal(replaySecond.ok, true);
  assert.equal(replaySecond.sessionId, second.id);
  assert.equal(listSessions(1).filter(session => !session.revokedAt).length, 2);
});

test('refresh rotation invalidates the old token except during the short reuse grace', () => {
  const session = createSession(1, 'device-a');
  const first = rotateSession(session.refreshToken, 'device-a');
  assert.equal(first.ok, true);
  assert.notEqual(first.refreshToken, session.refreshToken);

  const raced = rotateSession(session.refreshToken, 'device-a');
  assert.equal(raced.ok, true);
  assert.equal(raced.sessionId, session.id);
  assert.equal(raced.refreshToken, first.refreshToken);
  assert.equal(listSessions(1)[0].revokedAt, null);

  const current = rotateSession(first.refreshToken, 'device-a');
  assert.equal(current.ok, true);
  assert.equal(current.refreshToken, first.refreshToken);

  database.run(
    `UPDATE mcp_sessions SET rotated_at = ? WHERE id = ?`,
    [new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000).toISOString(), session.id]
  );
  const expiredReuse = rotateSession(session.refreshToken, 'device-a');
  assert.equal(expiredReuse.ok, false);
  assert.equal(expiredReuse.reason, 'INVALID_REFRESH_TOKEN');
  const stillLive = rotateSession(first.refreshToken, 'device-a');
  assert.equal(stillLive.ok, true);
  assert.equal(listSessions(1)[0].revokedAt, null);
});

test('explicit revoke is per session and does not family-revoke siblings', () => {
  const first = createSession(1, 'device-a');
  const second = createSession(1, 'device-b');
  assert.equal(revokeSession(first.id, 1).ok, true);
  assert.equal(rotateSession(first.refreshToken, 'device-a').reason, 'SESSION_REVOKED');
  const sibling = rotateSession(second.refreshToken, 'device-b');
  assert.equal(sibling.ok, true);
  assert.equal(sibling.sessionId, second.id);
});
