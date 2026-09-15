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
  createEfficiencyComparison,
  updateEfficiencyComparison,
  getEfficiencyAnalysis,
  getComparisonAudits
} = require('../services/efficiency-comparisons');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-efficiency-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db'), persist: false, mode: 'writer' });
  const timestamp = '2026-09-15T08:00:00.000Z';
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (1, 'worker', 'x', 'Worker', 'uploader', ?)`, [timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (2, 'admin', 'x', 'Admin', 'admin', ?)`, [timestamp]);
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function completedTask(ref, options = {}) {
  const task = ensureUsageTask({ taskKind: options.taskKind || 'create', actorUserId: 1, sourceRef: ref, isTest: options.isTest });
  completeUsageTask(task.id, { completedAt: '2026-09-15T09:00:00.000Z' });
  return task;
}

function sample(task, overrides = {}) {
  return createEfficiencyComparison({
    usageTaskId: task.id,
    measurementScope: 'award-2026',
    traditionalMinutes: 120,
    traditionalBaselineType: 'historical_similar',
    baselineSourceNote: '同类历史任务工时单 #A-12，由复核人确认',
    fuxiTotalMinutes: 60,
    aiOrPlatformMinutes: 30,
    manualReviewMinutes: 20,
    reworkMinutes: 10,
    comparable: true,
    evidenceNote: '实际操作与复核记录',
    measuredAt: '2026-09-15T09:30:00.000Z',
    reviewerUserId: 2,
    ...overrides
  }, { actorUserId: 2 });
}

test('empty analysis returns null rates instead of a fabricated saving', () => {
  const result = getEfficiencyAnalysis({ measurementScope: 'award-2026' });
  assert.deepEqual(result.summary, {
    comparableSampleCount: 0,
    traditionalTotalMinutes: 0,
    traditionalAverageMinutes: null,
    fuxiTotalMinutes: 0,
    fuxiAverageMinutes: null,
    absoluteSavedMinutes: null,
    aggregateTimeSavingRate: null
  });
});

test('aggregate is independently recomputable and preserves a negative case rate', () => {
  const slower = sample(completedTask('eff-slower'), { traditionalMinutes: 60, fuxiTotalMinutes: 90, aiOrPlatformMinutes: 40, manualReviewMinutes: 30, reworkMinutes: 20 });
  const faster = sample(completedTask('eff-faster', { taskKind: 'project' }), { traditionalMinutes: 120, fuxiTotalMinutes: 60 });
  assert.equal(slower.timeSavingRate, -50);
  assert.equal(faster.timeSavingRate, 50);

  const result = getEfficiencyAnalysis({ measurementScope: 'award-2026' });
  assert.equal(result.summary.comparableSampleCount, 2);
  assert.equal(result.summary.traditionalTotalMinutes, 180);
  assert.equal(result.summary.fuxiTotalMinutes, 150);
  assert.equal(result.summary.absoluteSavedMinutes, 30);
  assert.equal(result.summary.aggregateTimeSavingRate, 16.7);
  const sql = database.queryOne(`SELECT COUNT(*) sample_count, SUM(c.traditional_minutes) traditional_total,
      SUM(c.fuxi_total_minutes) fuxi_total
    FROM efficiency_comparisons c JOIN usage_tasks t ON t.id=c.usage_task_id
    WHERE c.measurement_scope='award-2026' AND c.comparable=1 AND c.traditional_minutes>0
      AND t.status='completed' AND t.is_test=0 AND COALESCE(t.exclusion_reason, '')=''`);
  assert.equal(Number(sql.sample_count), result.summary.comparableSampleCount);
  assert.equal(Number(sql.traditional_total), result.summary.traditionalTotalMinutes);
  assert.equal(Number(sql.fuxi_total), result.summary.fuxiTotalMinutes);
  assert.equal(result.summary.aggregateTimeSavingRate, Number((((sql.traditional_total - sql.fuxi_total) / sql.traditional_total) * 100).toFixed(1)));
  assert.deepEqual(result.rateDistribution.map(row => row.timeSavingRate).sort((a, b) => a - b), [-50, 50]);
});

test('non-comparable records remain visible but excluded from formal aggregation', () => {
  const task = completedTask('eff-not-comparable');
  createEfficiencyComparison({
    usageTaskId: task.id, measurementScope: 'award-2026', fuxiTotalMinutes: 45,
    comparable: false, exclusionReason: '没有可复核的传统方式基线', evidenceNote: '保留不可比事实',
    measuredAt: '2026-09-15T09:30:00.000Z', reviewerUserId: 2
  }, { actorUserId: 2 });
  const result = getEfficiencyAnalysis({ measurementScope: 'award-2026' });
  assert.equal(result.summary.comparableSampleCount, 0);
  assert.equal(result.recentSamples.length, 1);
  assert.equal(result.recentSamples[0].timeSavingRate, null);
  assert.equal(result.candidates[0].comparisonId !== null, true);
});

test('test or excluded tasks cannot receive an efficiency comparison', () => {
  const testTask = completedTask('eff-test', { isTest: true });
  assert.throws(() => sample(testTask), error => error.code === 'USAGE_TASK_NOT_EFFECTIVE');
  const excludedTask = completedTask('eff-excluded');
  setUsageTaskExclusion(excludedTask.id, { actorUserId: 2, exclusionReason: 'acceptance fixture' });
  assert.throws(() => sample(excludedTask), error => error.code === 'USAGE_TASK_NOT_EFFECTIVE');
  const laterExcluded = completedTask('eff-later-excluded');
  sample(laterExcluded);
  setUsageTaskExclusion(laterExcluded.id, { actorUserId: 2, exclusionReason: 'later classification' });
  assert.equal(getEfficiencyAnalysis({ measurementScope: 'award-2026' }).summary.comparableSampleCount, 0);
});

test('breakdown must equal total and duplicate scope cannot double count one task', () => {
  const task = completedTask('eff-unique');
  assert.throws(() => sample(task, { fuxiTotalMinutes: 61 }), /之和必须等于/);
  sample(task);
  assert.throws(() => sample(task), /UNIQUE constraint failed/);
});

test('updates require a reason and append immutable before/after audit evidence', () => {
  const comparison = sample(completedTask('eff-audit'));
  assert.throws(() => updateEfficiencyComparison(comparison.id, { evidenceNote: '修订' }, { actorUserId: 2 }), /change_reason/);
  const updated = updateEfficiencyComparison(comparison.id, {
    fuxiTotalMinutes: 75,
    aiOrPlatformMinutes: 35,
    manualReviewMinutes: 30,
    reworkMinutes: 10,
    evidenceNote: '补录人工复核时间',
    changeReason: '复核记录补齐'
  }, { actorUserId: 2 });
  assert.equal(updated.fuxiTotalMinutes, 75);
  assert.equal(updated.timeSavingRate, 37.5);
  const audits = getComparisonAudits(comparison.id);
  assert.deepEqual(audits.map(row => [row.action, row.change_reason]), [['created', 'initial_record'], ['updated', '复核记录补齐']]);
  assert.equal(JSON.parse(audits[1].before_json).fuxiTotalMinutes, 60);
});

test('admin HTTP API controls create, update and transparent analysis readback', async () => {
  const task = completedTask('eff-http');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminUsageRoutes);
  const server = await new Promise(resolve => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/admin/usage-efficiency`;
    const viewerToken = generateToken({ id: 1, username: 'worker', roles: ['uploader'] });
    const adminToken = generateToken({ id: 2, username: 'admin', roles: ['admin'] });
    const payload = {
      usageTaskId: task.id, measurementScope: 'award-2026', traditionalMinutes: 100,
      traditionalBaselineType: 'standard_process', baselineSourceNote: '标准流程测量记录 #S1',
      fuxiTotalMinutes: 120, aiOrPlatformMinutes: 50, manualReviewMinutes: 50, reworkMinutes: 20,
      comparable: true, measuredAt: '2026-09-15T09:30:00.000Z', reviewerUserId: 2
    };
    const forbidden = await fetch(`${base}/comparisons`, { method: 'POST', headers: { authorization: `Bearer ${viewerToken}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(forbidden.status, 403);
    const created = await fetch(`${base}/comparisons`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.data.timeSavingRate, -20);
    const missingReason = await fetch(`${base}/comparisons/${createdBody.data.id}`, { method: 'PUT', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ evidenceNote: 'change' }) });
    assert.equal(missingReason.status, 400);
    const analysis = await fetch(`${base}?measurementScope=award-2026`, { headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(analysis.status, 200);
    assert.equal((await analysis.json()).data.summary.aggregateTimeSavingRate, -20);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
