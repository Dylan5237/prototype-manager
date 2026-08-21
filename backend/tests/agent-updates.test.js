const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  AgentUpdateError,
  createRelease,
  getAvailableUpdates,
  createUpdateIntent,
  claimUpdateIntent,
  recordUpdateResult,
  reportSessionRuntime
} = require('../services/db-agent-updates');

let tempRoot;
const timestamp = '2026-08-21T00:00:00.000Z';
const sessionExpiresAt = '2030-01-01T00:00:00.000Z';

function manifest(releaseId, version) {
  return {
    releaseId,
    channel: 'stable',
    mcpVersion: version,
    skillVersion: version,
    apiSchemaVersion: '1',
    minNodeVersion: '18.0.0',
    artifacts: {
      mcp: { url: `/api/integrations/mcp-package?release=${releaseId}`, size: 100, sha256: 'a'.repeat(64) },
      skill: { url: `/api/integrations/skill-package?release=${releaseId}`, size: 200, sha256: 'b'.repeat(64) }
    }
  };
}

function seed() {
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'owner', 'hash', '负责人', '["admin"]', timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [2, 'editor', 'hash', '编辑者', '["viewer"]', timestamp]);
  database.run(`INSERT INTO mcp_sessions (
    id, user_id, refresh_token_hash, device_label, created_at, last_used_at, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ['session-1', 2, 'hash', 'Cursor 测试', timestamp, timestamp, sessionExpiresAt]);
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-agent-updates-'));
  await database.initDatabase({ path: path.join(tempRoot, 'updates.db'), persist: false });
  seed();
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('unknown legacy runtime versions do not produce a false update notification', () => {
  createRelease({ actorUserId: 1, manifest: manifest('release-1', '1.0.0') });
  const result = reportSessionRuntime({
    userId: 2,
    sessionId: 'session-1',
    mcpVersion: '0.1.0',
    skillVersion: 'unknown',
    runtimeVersion: 'v22.0.0',
    platform: 'win32'
  });
  assert.equal(result.current.versionsKnown, false);
  assert.deepEqual(result.updates, []);
});

test('heartbeat finds a published release and update intent is idempotent through completion', () => {
  createRelease({ actorUserId: 1, manifest: manifest('release-2', '2.0.0') });
  const heartbeat = reportSessionRuntime({
    userId: 2,
    sessionId: 'session-1',
    mcpVersion: '1.0.0',
    skillVersion: '1.0.0',
    runtimeVersion: 'v22.0.0',
    platform: 'win32'
  });
  assert.equal(heartbeat.current.versionsKnown, true);
  assert.equal(heartbeat.updates[0].releaseId, 'release-2');

  const first = createUpdateIntent({ userId: 2, sessionId: 'session-1', releaseId: 'release-2' });
  const second = createUpdateIntent({ userId: 2, sessionId: 'session-1', releaseId: 'release-2' });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.intent.id, first.intent.id);

  const claimed = claimUpdateIntent({ userId: 2, sessionId: 'session-1' });
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.intent.status, 'running');
  const repeatedClaim = claimUpdateIntent({ userId: 2, sessionId: 'session-1' });
  assert.equal(repeatedClaim.intent.id, first.intent.id);

  assert.throws(
    () => recordUpdateResult({
      userId: 2,
      intentId: first.intent.id,
      status: 'completed',
      localMcpVersion: '1.0.0',
      localSkillVersion: '1.0.0'
    }),
    error => error instanceof AgentUpdateError && error.code === 'VERSION_MISMATCH'
  );
  const completed = recordUpdateResult({
    userId: 2,
    intentId: first.intent.id,
    status: 'completed',
    localMcpVersion: '2.0.0',
    localSkillVersion: '2.0.0'
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.release.releaseId, 'release-2');
  const after = getAvailableUpdates({ userId: 2, sessionId: 'session-1' });
  assert.equal(after.recentIntents[0].status, 'completed');
  assert.equal(after.recentIntents[0].releaseId, 'release-2');
});

test('update intent and heartbeat enforce session ownership and lifecycle', () => {
  createRelease({ actorUserId: 1, manifest: manifest('release-3', '3.0.0') });
  assert.throws(
    () => getAvailableUpdates({ userId: 1, sessionId: 'session-1' }),
    error => error instanceof AgentUpdateError && error.code === 'SESSION_NOT_OWNED'
  );
  assert.throws(
    () => createUpdateIntent({ userId: 2, sessionId: 'session-1', releaseId: 'missing-release' }),
    error => error instanceof AgentUpdateError && error.code === 'RELEASE_NOT_FOUND'
  );
  assert.throws(
    () => claimUpdateIntent({ userId: 2, sessionId: 'missing-session' }),
    error => error instanceof AgentUpdateError && error.code === 'SESSION_NOT_FOUND'
  );
});
