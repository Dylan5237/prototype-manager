const crypto = require('crypto');
const { query, queryOne, run, runInTransaction } = require('../database/db');
const { normalizeSource } = require('./usage-events');

const TASK_KINDS = new Set(['create', 'direct', 'project']);
const TASK_STATUSES = new Set(['active', 'completed', 'failed', 'cancelled']);
const ATTEMPT_STATUSES = new Set(['started', 'completed', 'failed']);

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function cleanRef(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new TypeError(`${label} 不能为空`);
  return result.slice(0, 200);
}

function cleanOptionalId(value) {
  return value === null || value === undefined || value === '' ? null : String(value);
}

function cleanReason(value) {
  const reason = String(value || '').trim();
  return reason ? reason.slice(0, 160) : null;
}

function getUsageTaskById(taskId) {
  return taskId ? queryOne('SELECT * FROM usage_tasks WHERE id = ?', [taskId]) : null;
}

function getUsageTaskByRef(taskKind, sourceRef) {
  if (!TASK_KINDS.has(taskKind) || !sourceRef) return null;
  return queryOne('SELECT * FROM usage_tasks WHERE task_kind = ? AND source_ref = ?', [taskKind, String(sourceRef)]);
}

function findActiveUsageTaskForPrototype({ prototypeId, actorUserId, taskKind = 'create' }) {
  if (!prototypeId || !TASK_KINDS.has(taskKind)) return null;
  const clauses = ['task_kind = ?', 'prototype_id = ?', "status = 'active'"];
  const params = [taskKind, String(prototypeId)];
  if (actorUserId != null) {
    clauses.push('actor_user_id = ?');
    params.push(Number(actorUserId));
  }
  return queryOne(`
    SELECT * FROM usage_tasks
    WHERE ${clauses.join(' AND ')}
    ORDER BY started_at DESC
    LIMIT 1
  `, params);
}

function ensureUsageTask({
  taskKind,
  actorUserId,
  prototypeId = null,
  projectId = null,
  sourceRef,
  source = 'web',
  startedAt = now(),
  isTest = false,
  exclusionReason = null
} = {}) {
  if (!TASK_KINDS.has(taskKind)) throw new TypeError(`不支持的 usage task kind: ${taskKind}`);
  if (actorUserId == null) throw new TypeError('actorUserId 不能为空');
  const ref = cleanRef(sourceRef, 'sourceRef');
  const existing = getUsageTaskByRef(taskKind, ref);
  if (existing) {
    const patch = [];
    const params = [];
    if (!existing.prototype_id && prototypeId) { patch.push('prototype_id = ?'); params.push(String(prototypeId)); }
    if (!existing.project_id && projectId) { patch.push('project_id = ?'); params.push(String(projectId)); }
    if (patch.length) {
      patch.push('updated_at = ?');
      params.push(now(), existing.id);
      run(`UPDATE usage_tasks SET ${patch.join(', ')} WHERE id = ?`, params);
      return getUsageTaskById(existing.id);
    }
    return existing;
  }

  const timestamp = String(startedAt || now());
  const exclusion = cleanReason(exclusionReason);
  const taskId = id('utask');
  run(`
    INSERT INTO usage_tasks
      (id, task_kind, actor_user_id, prototype_id, project_id, source_ref, source,
       status, outcome, is_test, exclusion_reason, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?)
  `, [
    taskId,
    taskKind,
    Number(actorUserId),
    cleanOptionalId(prototypeId),
    cleanOptionalId(projectId),
    ref,
    normalizeSource(source),
    isTest ? 1 : 0,
    exclusion,
    timestamp,
    timestamp,
    timestamp
  ]);
  return getUsageTaskById(taskId);
}

function beginUsageTaskAttempt({ taskId, operation, idempotencyKey = null, metadata = {}, startedAt = now() } = {}) {
  if (!taskId) return null;
  const cleanOperation = cleanRef(operation, 'operation').slice(0, 100);
  const cleanKey = idempotencyKey ? String(idempotencyKey).trim().slice(0, 200) : null;
  if (cleanKey) {
    const existing = queryOne(
      'SELECT * FROM usage_task_attempts WHERE usage_task_id = ? AND idempotency_key = ?',
      [taskId, cleanKey]
    );
    if (existing) return existing;
  }
  const timestamp = String(startedAt || now());
  const attemptId = id('uattempt');
  const attempt = runInTransaction(db => {
    const next = queryOne(
      'SELECT COALESCE(MAX(attempt_no), 0) AS max_no FROM usage_task_attempts WHERE usage_task_id = ?',
      [taskId]
    );
    const attemptNo = Number(next?.max_no || 0) + 1;
    db.run(`
      INSERT INTO usage_task_attempts
        (id, usage_task_id, attempt_no, operation, idempotency_key, status, metadata_json, started_at)
      VALUES (?, ?, ?, ?, ?, 'started', ?, ?)
    `, [attemptId, taskId, attemptNo, cleanOperation, cleanKey, JSON.stringify(metadata || {}), timestamp]);
    return attemptNo;
  });
  return queryOne('SELECT * FROM usage_task_attempts WHERE id = ?', [attemptId]) || {
    id: attemptId,
    usage_task_id: taskId,
    attempt_no: attempt
  };
}

function finishUsageTaskAttempt({ attemptId, status = 'completed', failureCode = null, completedAt = now() } = {}) {
  if (!attemptId || !ATTEMPT_STATUSES.has(status)) return null;
  run(`
    UPDATE usage_task_attempts
    SET status = ?, failure_code = ?, completed_at = ?
    WHERE id = ?
  `, [status, failureCode ? String(failureCode).slice(0, 160) : null, completedAt, attemptId]);
  return queryOne('SELECT * FROM usage_task_attempts WHERE id = ?', [attemptId]);
}

function updateUsageTask(taskId, { status, outcome, prototypeId, projectId, completedAt, updatedAt = now() } = {}) {
  if (!taskId) return null;
  if (status && !TASK_STATUSES.has(status)) throw new TypeError(`不支持的 usage task status: ${status}`);
  const fields = [];
  const params = [];
  if (status) { fields.push('status = ?'); params.push(status); }
  if (outcome !== undefined) { fields.push('outcome = ?'); params.push(outcome === null ? null : String(outcome).slice(0, 80)); }
  if (prototypeId !== undefined) { fields.push('prototype_id = ?'); params.push(cleanOptionalId(prototypeId)); }
  if (projectId !== undefined) { fields.push('project_id = ?'); params.push(cleanOptionalId(projectId)); }
  if (completedAt !== undefined) { fields.push('completed_at = ?'); params.push(completedAt); }
  if (!fields.length) return getUsageTaskById(taskId);
  fields.push('updated_at = ?');
  params.push(updatedAt, taskId);
  run(`UPDATE usage_tasks SET ${fields.join(', ')} WHERE id = ?`, params);
  return getUsageTaskById(taskId);
}

function completeUsageTask(taskId, fields = {}) {
  return updateUsageTask(taskId, { ...fields, status: 'completed', outcome: fields.outcome || 'success', completedAt: fields.completedAt || now() });
}

function failUsageTask(taskId, fields = {}) {
  return updateUsageTask(taskId, { ...fields, status: 'failed', outcome: fields.outcome || 'failure', completedAt: fields.completedAt || now() });
}

function cancelUsageTask(taskId, fields = {}) {
  return updateUsageTask(taskId, { ...fields, status: 'cancelled', outcome: fields.outcome || 'cancelled', completedAt: fields.completedAt || now() });
}

function setUsageTaskExclusion(taskId, { isTest = false, exclusionReason = null } = {}) {
  const reason = cleanReason(exclusionReason);
  run('UPDATE usage_tasks SET is_test = ?, exclusion_reason = ?, updated_at = ? WHERE id = ?', [isTest ? 1 : 0, reason, now(), taskId]);
  return getUsageTaskById(taskId);
}

function requestClassification(req) {
  const isTest = String(req?.get?.('x-fuxi-usage-is-test') || '').toLowerCase() === 'true';
  const exclusionReason = cleanReason(req?.get?.('x-fuxi-usage-exclusion-reason'));
  return { isTest, exclusionReason };
}

function getEffectiveUsageTaskStats({ from, to } = {}) {
  const clauses = [
    "status = 'completed'",
    'is_test = 0',
    "COALESCE(exclusion_reason, '') = ''"
  ];
  const params = [];
  if (from) { clauses.push('completed_at >= ?'); params.push(from); }
  if (to) { clauses.push('completed_at < ?'); params.push(to); }
  const tasks = query(`
    SELECT * FROM usage_tasks
    WHERE ${clauses.join(' AND ')}
    ORDER BY completed_at ASC, id ASC
  `, params);
  const taskIds = tasks.map(task => task.id);
  const attempts = taskIds.length
    ? query(`SELECT usage_task_id, COUNT(*) AS count FROM usage_task_attempts WHERE usage_task_id IN (${taskIds.map(() => '?').join(',')}) GROUP BY usage_task_id`, taskIds)
    : [];
  const attemptsByTask = new Map(attempts.map(row => [row.usage_task_id, Number(row.count)]));
  const users = new Map();
  tasks.forEach(task => users.set(Number(task.actor_user_id), (users.get(Number(task.actor_user_id)) || 0) + 1));
  return {
    period: { from: from || null, to: to || null },
    completedTaskCount: tasks.length,
    distinctActorCount: users.size,
    repeatUserCount: [...users.values()].filter(count => count >= 2).length,
    attemptCount: tasks.reduce((sum, task) => sum + (attemptsByTask.get(task.id) || 0), 0),
    tasks: tasks.map(task => ({ ...task, attempt_count: attemptsByTask.get(task.id) || 0 }))
  };
}

module.exports = {
  TASK_KINDS,
  TASK_STATUSES,
  getUsageTaskById,
  getUsageTaskByRef,
  findActiveUsageTaskForPrototype,
  ensureUsageTask,
  beginUsageTaskAttempt,
  finishUsageTaskAttempt,
  completeUsageTask,
  failUsageTask,
  cancelUsageTask,
  setUsageTaskExclusion,
  requestClassification,
  getEffectiveUsageTaskStats
};
