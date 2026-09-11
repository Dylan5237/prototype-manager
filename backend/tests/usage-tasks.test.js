const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const database = require('../database/db');
const { createPrototype } = require('../services/db-prototypes');
const {
  ensureUsageTask,
  beginUsageTaskAttempt,
  finishUsageTaskAttempt,
  completeUsageTask,
  getEffectiveUsageTaskStats
} = require('../services/usage-tasks');
const { recordUsageEvent } = require('../services/usage-events');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-usage-tasks-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db'), persist: false });
  const timestamp = new Date().toISOString();
  database.run(
    `INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    ['task-owner', 'test', 'Task Owner', 'user', timestamp]
  );
  database.run(
    `INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    ['admin-owner', 'test', 'Admin Owner', 'admin', timestamp]
  );
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('usage ledger keeps one effective task while counting retries as attempts', () => {
  const prototype = createPrototype({ id: 'proto_usage_1', name: 'Usage test prototype', createdBy: 1 });

  const createTask = ensureUsageTask({
    taskKind: 'create',
    actorUserId: 1,
    prototypeId: prototype.id,
    sourceRef: `prototype:${prototype.id}`,
    source: 'mcp'
  });
  const firstAttempt = beginUsageTaskAttempt({ taskId: createTask.id, operation: 'deliver', idempotencyKey: 'deliver-1' });
  const replayAttempt = beginUsageTaskAttempt({ taskId: createTask.id, operation: 'deliver', idempotencyKey: 'deliver-1' });
  assert.equal(replayAttempt.id, firstAttempt.id);
  finishUsageTaskAttempt({ attemptId: firstAttempt.id, status: 'failed', failureCode: 'READBACK_FAILED' });
  const secondAttempt = beginUsageTaskAttempt({ taskId: createTask.id, operation: 'deliver', idempotencyKey: 'deliver-2' });
  finishUsageTaskAttempt({ attemptId: secondAttempt.id, status: 'completed' });
  recordUsageEvent({
    eventType: 'version_created',
    userId: 1,
    source: 'mcp',
    resourceType: 'prototype',
    resourceId: prototype.id,
    usageTaskId: createTask.id,
    attemptId: secondAttempt.id,
    attemptNo: secondAttempt.attempt_no
  });
  completeUsageTask(createTask.id, { prototypeId: prototype.id, outcome: 'version_created' });

  const stats = getEffectiveUsageTaskStats();
  assert.equal(stats.completedTaskCount, 1);
  assert.equal(stats.distinctActorCount, 1);
  assert.equal(stats.repeatUserCount, 0);
  assert.equal(stats.attemptCount, 2);
  assert.equal(stats.tasks[0].attempt_count, 2);
  assert.equal(database.queryOne('SELECT usage_task_id, attempt_no FROM usage_events LIMIT 1').usage_task_id, createTask.id);
});

test('direct and project kinds are effective, explicit tests are excluded, and admin role is not an exclusion', () => {
  const directTask = ensureUsageTask({ taskKind: 'direct', actorUserId: 1, sourceRef: 'direct-change-1', source: 'web' });
  const directAttempt = beginUsageTaskAttempt({ taskId: directTask.id, operation: 'finalize_version' });
  finishUsageTaskAttempt({ attemptId: directAttempt.id, status: 'completed' });
  completeUsageTask(directTask.id, { outcome: 'version_created' });

  const projectTask = ensureUsageTask({ taskKind: 'project', actorUserId: 1, sourceRef: 'project-task-1', source: 'web' });
  const projectAttempt = beginUsageTaskAttempt({ taskId: projectTask.id, operation: 'submit_candidate' });
  finishUsageTaskAttempt({ attemptId: projectAttempt.id, status: 'completed' });
  completeUsageTask(projectTask.id, { outcome: 'candidate_adopted' });

  const adminTask = ensureUsageTask({ taskKind: 'project', actorUserId: 2, sourceRef: 'project-task-admin', source: 'web' });
  completeUsageTask(adminTask.id, { outcome: 'candidate_adopted' });

  const excludedTask = ensureUsageTask({
    taskKind: 'create',
    actorUserId: 1,
    sourceRef: 'acceptance-fixture-1',
    source: 'system',
    isTest: true,
    exclusionReason: 'acceptance_fixture'
  });
  completeUsageTask(excludedTask.id, { outcome: 'version_created' });

  const stats = getEffectiveUsageTaskStats();
  assert.equal(stats.completedTaskCount, 3);
  assert.equal(stats.distinctActorCount, 2);
  assert.equal(stats.repeatUserCount, 1);
  assert.deepEqual(stats.tasks.map(task => task.task_kind).sort(), ['direct', 'project', 'project']);
});

test('a legacy upload without a usage task is not counted as an effective task', () => {
  createPrototype({ id: 'legacy_proto', name: 'Legacy upload', createdBy: 1 });
  database.run(
    `INSERT INTO prototype_versions (prototype_id, version_number, entry_file, created_at, created_by, sync_source)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['legacy_proto', 1, 'index.html', new Date().toISOString(), 1, 'upload']
  );
  const stats = getEffectiveUsageTaskStats();
  assert.equal(stats.completedTaskCount, 0);
  assert.equal(stats.attemptCount, 0);
});
