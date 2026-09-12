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
  getEffectiveUsageTaskStats,
  getUsageEffectivenessAnalysis,
  findActiveUsageTaskForPrototype,
  setUsageTaskExclusion,
  requestClassification
} = require('../services/usage-tasks');
const { recordUsageEvent, getUsageEvents } = require('../services/usage-events');
const { getEventDefinition } = require('../services/usage-event-definitions');

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
    source: 'system'
  });
  completeUsageTask(excludedTask.id, { outcome: 'version_created' });
  assert.throws(
    () => setUsageTaskExclusion(excludedTask.id, { actorUserId: 1, isTest: true, exclusionReason: 'acceptance_fixture' }),
    error => error.code === 'USAGE_TASK_EXCLUSION_FORBIDDEN'
  );
  setUsageTaskExclusion(excludedTask.id, {
    actorUserId: 2,
    isTest: true,
    exclusionReason: 'acceptance_fixture'
  });
  assert.equal(getUsageEvents({ eventTypes: ['usage_task_excluded'] }).length, 1);
  const audit = database.queryOne(
    `SELECT action, resource_type, resource_id, metadata_json FROM audit_events WHERE action = 'usage_task.exclusion_changed'`
  );
  assert.equal(audit.resource_type, 'usage_task');
  assert.equal(audit.resource_id, excludedTask.id);
  assert.match(audit.metadata_json, /acceptance_fixture/);

  const stats = getEffectiveUsageTaskStats();
  assert.equal(stats.completedTaskCount, 3);
  assert.equal(stats.distinctActorCount, 2);
  assert.equal(stats.repeatUserCount, 1);
  assert.deepEqual(stats.tasks.map(task => task.task_kind).sort(), ['direct', 'project', 'project']);
});

test('client classification headers are ignored and create completion stays actor-scoped', () => {
  assert.deepEqual(requestClassification({ get: () => 'true' }), { isTest: false, exclusionReason: null });
  const prototype = createPrototype({ id: 'proto_actor_scope', name: 'Actor scope', createdBy: 1 });
  const task = ensureUsageTask({
    taskKind: 'create',
    actorUserId: 1,
    prototypeId: prototype.id,
    sourceRef: `prototype:${prototype.id}`
  });
  assert.equal(findActiveUsageTaskForPrototype({ prototypeId: prototype.id, actorUserId: 1 }).id, task.id);
  assert.equal(findActiveUsageTaskForPrototype({ prototypeId: prototype.id, actorUserId: 2 }), null);
});

test('domain and usage ledger writes roll back together when usage creation rejects', () => {
  assert.throws(() => database.runInTransaction(() => {
    createPrototype({ id: 'atomic_proto', name: 'Atomic prototype', createdBy: 1 });
    ensureUsageTask({ taskKind: 'create', actorUserId: 1, prototypeId: 'atomic_proto', sourceRef: '' });
  }), /sourceRef 不能为空/);
  assert.equal(database.queryOne('SELECT id FROM prototypes WHERE id = ?', ['atomic_proto']), null);
  assert.equal(database.queryOne('SELECT id FROM usage_tasks WHERE source_ref = ?', ['']), null);
});

test('exclusion mutation rolls back when authoritative audit insertion fails', () => {
  const task = ensureUsageTask({ taskKind: 'create', actorUserId: 1, sourceRef: 'audit-failure-task' });
  database.run(`
    CREATE TRIGGER fail_usage_task_exclusion_audit
    BEFORE INSERT ON audit_events
    WHEN NEW.action = 'usage_task.exclusion_changed'
    BEGIN
      SELECT RAISE(ABORT, 'injected audit failure');
    END;
  `);

  assert.throws(
    () => setUsageTaskExclusion(task.id, { actorUserId: 2, isTest: true, exclusionReason: 'injected_failure' }),
    /injected audit failure/
  );
  const unchanged = database.queryOne('SELECT is_test, exclusion_reason FROM usage_tasks WHERE id = ?', [task.id]);
  assert.equal(Number(unchanged.is_test), 0);
  assert.equal(unchanged.exclusion_reason, null);
  assert.equal(database.query(`SELECT id FROM audit_events WHERE resource_id = ?`, [task.id]).length, 0);
});

test('project adoption event names use the canonical event catalog', () => {
  assert.equal(getEventDefinition('change_adopted').effective, true);
  assert.equal(getEventDefinition('change_rejected').effective, true);
  assert.equal(getEventDefinition('candidate_adopted').effective, false);
  assert.equal(getEventDefinition('candidate_returned').effective, false);
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

test('effectiveness analysis maps completed real tasks to summary, trend, kinds and evidence details', () => {
  const createTask = ensureUsageTask({ taskKind: 'create', actorUserId: 1, sourceRef: 'analysis-create', source: 'mcp', startedAt: '2026-09-10T08:00:00.000Z' });
  const retry1 = beginUsageTaskAttempt({ taskId: createTask.id, operation: 'upload', startedAt: '2026-09-10T08:01:00.000Z' });
  finishUsageTaskAttempt({ attemptId: retry1.id, status: 'failed', failureCode: 'INVALID_ZIP', completedAt: '2026-09-10T08:02:00.000Z' });
  const retry2 = beginUsageTaskAttempt({ taskId: createTask.id, operation: 'upload', startedAt: '2026-09-10T08:03:00.000Z' });
  finishUsageTaskAttempt({ attemptId: retry2.id, status: 'completed', completedAt: '2026-09-10T08:04:00.000Z' });
  completeUsageTask(createTask.id, { outcome: 'version_created', completedAt: '2026-09-10T08:05:00.000Z' });

  const directTask = ensureUsageTask({ taskKind: 'direct', actorUserId: 1, sourceRef: 'analysis-direct', source: 'web', startedAt: '2026-09-11T08:00:00.000Z' });
  completeUsageTask(directTask.id, { outcome: 'version_created', completedAt: '2026-09-11T08:05:00.000Z' });

  const excluded = ensureUsageTask({ taskKind: 'project', actorUserId: 1, sourceRef: 'analysis-excluded', source: 'system' });
  completeUsageTask(excluded.id, { completedAt: '2026-09-11T09:00:00.000Z' });
  setUsageTaskExclusion(excluded.id, { actorUserId: 2, isTest: true, exclusionReason: 'analysis_fixture' });

  const active = ensureUsageTask({ taskKind: 'project', actorUserId: 1, sourceRef: 'analysis-active', source: 'web' });
  assert.equal(active.status, 'active');

  const result = getUsageEffectivenessAnalysis({ from: '2026-09-10T00:00:00.000Z', to: '2026-09-12T00:00:00.000Z' });
  assert.deepEqual(result.summary, {
    completedTaskCount: 2,
    distinctActorCount: 1,
    repeatUserCount: 1,
    repeatUserRate: 100,
    attemptCount: 2,
    averageAttemptsPerTask: 1
  });
  assert.deepEqual(result.kindDistribution, [
    { kind: 'create', count: 1 },
    { kind: 'direct', count: 1 },
    { kind: 'project', count: 0 }
  ]);
  assert.deepEqual(result.trend.map(point => [point.date, point.total, point.create, point.direct]), [
    ['2026-09-10', 1, 1, 0],
    ['2026-09-11', 1, 0, 1]
  ]);
  assert.equal(result.recentTasks[1].attemptCount, 2);
  assert.deepEqual(result.recentTasks[1].attempts.map(item => [item.attemptNo, item.status]), [[1, 'failed'], [2, 'completed']]);
  assert.deepEqual(result.exclusionRules, ["status = 'completed'", 'is_test = 0', "COALESCE(exclusion_reason, '') = ''"]);
});

test('effectiveness analysis exposes a null repeat rate without an effective-user denominator', () => {
  const result = getUsageEffectivenessAnalysis();
  assert.equal(result.summary.completedTaskCount, 0);
  assert.equal(result.summary.repeatUserRate, null);
  assert.equal(result.summary.averageAttemptsPerTask, null);
});
