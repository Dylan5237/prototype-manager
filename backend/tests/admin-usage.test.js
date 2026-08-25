const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const database = require('../database/db');
const { recordUsageEvent } = require('../services/usage-events');
const { getUsageStats } = require('../services/db-usage-stats');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-admin-usage-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db'), persist: false });
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function insertUser(id, username, role, createdAt) {
  database.run(
    `INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, username, 'test-hash', username, JSON.stringify([role]), createdAt]
  );
}

test('usage events are sanitized and event keys are idempotent', () => {
  insertUser(1, 'alice', 'uploader', '2026-08-01T00:00:00.000Z');
  const first = recordUsageEvent({
    eventType: 'prototype_created',
    userId: 1,
    resourceType: 'prototype',
    resourceId: 'p1',
    eventKey: 'prototype-created:p1',
    metadata: { token: 'must-not-store', label: 'ok' }
  });
  const duplicate = recordUsageEvent({
    eventType: 'prototype_created',
    userId: 1,
    eventKey: 'prototype-created:p1',
    metadata: { label: 'second' }
  });

  assert.equal(first.recorded, true);
  assert.equal(duplicate.duplicate, true);
  const rows = database.query(`SELECT COUNT(*) AS count FROM usage_events`);
  assert.equal(rows[0].count, 1);
});

test('admin usage stats combine tracked events and legacy facts with stable definitions', () => {
  insertUser(1, 'alice', 'uploader', '2026-08-01T00:00:00.000Z');
  insertUser(2, 'bob', 'viewer', '2026-08-20T00:00:00.000Z');
  insertUser(3, 'user', 'viewer', '2026-08-01T00:00:00.000Z');
  database.run(`
    INSERT INTO prototypes (id, name, description, created_by, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `, ['p1', '采购原型', '', 1, '2026-08-01T01:00:00.000Z', '2026-08-20T01:00:00.000Z']);
  database.run(`
    INSERT INTO prototype_versions (prototype_id, version_number, created_by, created_at, version_label)
    VALUES (?, ?, ?, ?, ?)
  `, ['p1', 1, 1, '2026-08-02T01:00:00.000Z', '1.0.0']);

  recordUsageEvent({ eventType: 'prototype_created', userId: 1, resourceType: 'prototype', resourceId: 'p1', occurredAt: '2026-08-01T01:00:00.000Z' });
  recordUsageEvent({ eventType: 'prototype_previewed', userId: 2, source: 'web', resourceType: 'prototype', resourceId: 'p1', occurredAt: '2026-08-21T01:00:00.000Z' });
  recordUsageEvent({ eventType: 'version_created', userId: 1, resourceType: 'prototype', resourceId: 'p1', occurredAt: '2026-08-02T01:00:00.000Z' });
  database.run(`INSERT INTO prototype_visits (prototype_id, user_id, visited_at) VALUES (?, ?, ?)`, ['p1', 2, '2026-08-21T02:00:00.000Z']);

  const stats = getUsageStats({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' });
  assert.equal(stats.summary.totalUsers, 2);
  assert.equal(stats.summary.activeUsers, 2);
  assert.equal(stats.summary.productiveUsers, 1);
  assert.equal(stats.summary.activePrototypes, 1);
  assert.equal(stats.summary.versions, 1);
  assert.equal(stats.summary.activationRate, 100);
  assert.equal(stats.trend.length, 30);
  assert.equal(stats.topPrototypes[0].id, 'p1');
  assert.equal(stats.dataQuality.isPartial, true);
});
