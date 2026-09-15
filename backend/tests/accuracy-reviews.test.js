const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const database = require('../database/db');
const adminUsageRoutes = require('../routes/admin-usage');
const { generateToken } = require('../middleware/auth');
const { ensureUsageTask, completeUsageTask, setUsageTaskExclusion } = require('../services/usage-tasks');
const {
  createAccuracyReview, updateAccuracyReview, getAccuracyReview,
  getAccuracyAnalysis, getAccuracyReviewAudits
} = require('../services/accuracy-reviews');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-accuracy-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db'), persist: false, mode: 'writer' });
  const timestamp = '2026-09-15T08:00:00.000Z';
  database.run(`INSERT INTO users (id,username,password_hash,nickname,role,created_at) VALUES
    (1,'worker','x','Worker','uploader',?), (2,'admin','x','Admin','admin',?)`, [timestamp, timestamp]);
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function completedTask(ref, options = {}) {
  const task = ensureUsageTask({ taskKind: options.taskKind || 'create', actorUserId: 1, sourceRef: ref, isTest: options.isTest });
  completeUsageTask(task.id, { completedAt: options.completedAt || '2026-09-15T09:00:00.000Z' });
  return task;
}

function review(task, overrides = {}) {
  return createAccuracyReview({
    usageTaskId: task.id, measurementScope: 'award-2026', outcome: 'pass', severeError: false,
    artifactType: 'prototype_version', artifactRef: 'version:1', included: true,
    reviewNote: '人工复核业务结果与需求一致', reviewedAt: '2026-09-15T10:00:00.000Z', ...overrides
  }, { actorUserId: 2 });
}

test('zero reviewed cases keep accuracy null', () => {
  assert.deepEqual(getAccuracyAnalysis({ measurementScope: 'award-2026' }).summary, {
    reviewedCount: 0, passCount: 0, partialCount: 0, failCount: 0, accuracyRate: null, severeErrorCount: 0
  });
});

test('pass over reviewed formula is independently recomputable and severe error is independent', () => {
  review(completedTask('accuracy-pass'), { outcome: 'pass', severeError: true });
  review(completedTask('accuracy-partial'), { outcome: 'partial' });
  review(completedTask('accuracy-fail'), { outcome: 'fail', severeError: true });
  const result = getAccuracyAnalysis({ measurementScope: 'award-2026' });
  assert.deepEqual(result.summary, {
    reviewedCount: 3, passCount: 1, partialCount: 1, failCount: 1, accuracyRate: 33.3, severeErrorCount: 2
  });
  assert.deepEqual(result.severeErrorReviews.map(row => row.outcome).sort(), ['fail', 'pass']);
  const sql = database.queryOne(`SELECT COUNT(*) reviewed, SUM(CASE WHEN r.outcome='pass' THEN 1 ELSE 0 END) passed
    FROM accuracy_review_cases r JOIN usage_tasks t ON t.id=r.usage_task_id
    WHERE r.measurement_scope='award-2026' AND r.included=1 AND t.status='completed'
      AND t.is_test=0 AND COALESCE(t.exclusion_reason,'')=''`);
  assert.equal(Number(sql.reviewed), result.summary.reviewedCount);
  assert.equal(Number(sql.passed), result.summary.passCount);
  assert.equal(result.summary.accuracyRate, Number(((sql.passed / sql.reviewed) * 100).toFixed(1)));
});

test('period membership follows task completed_at and review time remains metadata', () => {
  const before = completedTask('accuracy-before', { completedAt: '2026-09-14T23:59:59.000Z' });
  review(before, { reviewedAt: '2026-09-15T12:00:00.000Z' });
  const inside = completedTask('accuracy-inside', { completedAt: '2026-09-15T09:00:00.000Z' });
  const insideReview = review(inside, { reviewedAt: '2026-09-17T12:00:00.000Z' });
  const result = getAccuracyAnalysis({ measurementScope: 'award-2026', from: '2026-09-15T00:00:00.000Z', to: '2026-09-16T00:00:00.000Z' });
  assert.equal(result.periodAnchor, 'usage_tasks.completed_at');
  assert.equal(result.summary.reviewedCount, 1);
  assert.deepEqual(result.recentReviews.map(row => row.id), [insideReview.id]);
  assert.equal(result.recentReviews[0].reviewedAt, '2026-09-17T12:00:00.000Z');
  assert.deepEqual(result.candidates.map(row => row.id), [inside.id]);
});

test('test and excluded tasks are rejected while post-hoc exclusion preserves review and audit', () => {
  assert.throws(() => review(completedTask('accuracy-test', { isTest: true })), error => error.code === 'USAGE_TASK_NOT_EFFECTIVE');
  const excluded = completedTask('accuracy-excluded');
  setUsageTaskExclusion(excluded.id, { actorUserId: 2, exclusionReason: 'acceptance fixture' });
  assert.throws(() => review(excluded), error => error.code === 'USAGE_TASK_NOT_EFFECTIVE');
  const later = completedTask('accuracy-later-excluded');
  const created = review(later);
  setUsageTaskExclusion(later.id, { actorUserId: 2, isTest: true, exclusionReason: 'later classification' });
  const result = getAccuracyAnalysis({ measurementScope: 'award-2026' });
  assert.equal(result.summary.reviewedCount, 0);
  assert.equal(result.recentReviews[0].includedInFormalAggregate, false);
  assert.equal(result.recentReviews[0].formalExclusionReason, 'task_is_test');
  assert.equal(getAccuracyReview(created.id).id, created.id);
  assert.equal(getAccuracyReviewAudits(created.id).length, 1);
});

test('duplicate review is rejected and excluded review requires a reason', () => {
  const task = completedTask('accuracy-unique');
  review(task);
  assert.throws(() => review(task), error => error.code === 'ACCURACY_REVIEW_DUPLICATE');
  assert.throws(() => review(completedTask('accuracy-no-reason'), { included: false, exclusionReason: '' }), /exclusion_reason/);
});

test('revision requires a reason, appends before/after audit and rolls back when audit insert fails', () => {
  const created = review(completedTask('accuracy-audit'));
  assert.throws(() => updateAccuracyReview(created.id, { outcome: 'partial' }, { actorUserId: 2 }), /change_reason/);
  const updated = updateAccuracyReview(created.id, { outcome: 'partial', severeError: true, reviewNote: '复核发现部分偏差', changeReason: '补充复核结论' }, { actorUserId: 2 });
  assert.equal(updated.outcome, 'partial');
  assert.equal(updated.severeError, true);
  const audits = getAccuracyReviewAudits(created.id);
  assert.deepEqual(audits.map(row => [row.action, row.change_reason]), [['created', 'initial_record'], ['updated', '补充复核结论']]);
  assert.equal(JSON.parse(audits[1].before_json).outcome, 'pass');

  database.run(`CREATE TRIGGER reject_accuracy_audit BEFORE INSERT ON accuracy_review_case_audits
    WHEN NEW.action='updated' BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END`);
  assert.throws(() => updateAccuracyReview(created.id, { outcome: 'fail', reviewNote: '不应保留', changeReason: '触发回滚' }, { actorUserId: 2 }), /forced audit failure/);
  assert.equal(getAccuracyReview(created.id).outcome, 'partial');
  assert.equal(getAccuracyReviewAudits(created.id).length, 2);
});

test('HTTP requires authentication and admin role while admin can create and read analysis', async () => {
  const task = completedTask('accuracy-http');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminUsageRoutes);
  const server = await new Promise(resolve => { const started = app.listen(0, '127.0.0.1', () => resolve(started)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/admin/usage-accuracy`;
    const viewer = generateToken({ id: 1, username: 'worker', roles: ['uploader'] });
    const admin = generateToken({ id: 2, username: 'admin', roles: ['admin'] });
    const payload = { usageTaskId: task.id, measurementScope: 'award-2026', outcome: 'fail', severeError: true, reviewNote: '人工确认严重错误', reviewedAt: '2026-09-15T10:00:00.000Z' };
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(`${base}/reviews`, { method: 'POST', headers: { authorization: `Bearer ${viewer}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) })).status, 403);
    const created = await fetch(`${base}/reviews`, { method: 'POST', headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, reviewerUserId: 1 }) });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.data.reviewerUserId, 2);
    const analysis = await fetch(`${base}?measurementScope=award-2026`, { headers: { authorization: `Bearer ${admin}` } });
    assert.equal(analysis.status, 200);
    const body = await analysis.json();
    assert.equal(body.data.summary.accuracyRate, 0);
    assert.equal(body.data.severeErrorReviews[0].id, createdBody.data.id);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
