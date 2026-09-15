const crypto = require('crypto');
const { query, queryOne, runInTransaction } = require('../database/db');

const BASELINE_TYPES = new Set(['historical_similar', 'standard_process', 'paired_comparison', 'other_verified']);

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`; }
function text(value, max = 500) {
  const result = String(value ?? '').trim();
  return result ? result.slice(0, max) : null;
}
function number(value, label, { required = false, positive = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    if (required) throw new TypeError(`${label} 不能为空`);
    return null;
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || (positive && result <= 0)) {
    throw new TypeError(`${label} 必须是${positive ? '大于 0' : '非负'}的分钟数`);
  }
  return result;
}

function taskForComparison(taskId) {
  return queryOne(`
    SELECT t.*, u.username AS actor_username, u.nickname AS actor_nickname
    FROM usage_tasks t LEFT JOIN users u ON u.id = t.actor_user_id
    WHERE t.id = ?
  `, [taskId]);
}

function assertEffectiveTask(task) {
  if (!task) throw Object.assign(new Error('usage task 不存在'), { code: 'USAGE_TASK_NOT_FOUND' });
  if (task.status !== 'completed' || Number(task.is_test) !== 0 || text(task.exclusion_reason)) {
    throw Object.assign(new Error('只能为 completed 且未标记测试/排除的 usage task 记录效率样本'), { code: 'USAGE_TASK_NOT_EFFECTIVE' });
  }
}

function normalizeInput(input, { actorUserId, existing = null } = {}) {
  const comparable = input.comparable === true || input.comparable === 1;
  const traditionalMinutes = number(input.traditionalMinutes, 'traditional_minutes', { required: comparable, positive: comparable });
  const fuxiTotalMinutes = number(input.fuxiTotalMinutes, 'fuxi_total_minutes', { required: true });
  const baselineType = text(input.traditionalBaselineType, 80);
  const baselineSourceNote = text(input.baselineSourceNote, 1000);
  const exclusionReason = text(input.exclusionReason, 300);
  const evidenceNote = text(input.evidenceNote, 2000);
  if (baselineType && !BASELINE_TYPES.has(baselineType)) throw new TypeError('traditional_baseline_type 不受支持');
  if (comparable && (!baselineType || !baselineSourceNote)) throw new TypeError('可比样本必须填写可信的传统基线类型和来源说明');
  if (!comparable && !exclusionReason) throw new TypeError('不可比样本必须填写 exclusion_reason');

  const parts = ['aiOrPlatformMinutes', 'manualReviewMinutes', 'reworkMinutes'];
  const hasBreakdown = parts.some(key => input[key] !== '' && input[key] !== null && input[key] !== undefined);
  const breakdown = parts.map(key => number(input[key], key) ?? 0);
  if (hasBreakdown && Math.abs(breakdown.reduce((sum, item) => sum + item, 0) - fuxiTotalMinutes) > 0.001) {
    throw new TypeError('填写耗时拆分时，AI/平台操作、人工复核与返工之和必须等于伏羲实际总耗时');
  }
  const measuredAt = text(input.measuredAt, 50);
  if (!measuredAt || Number.isNaN(new Date(measuredAt).getTime())) throw new TypeError('measured_at 必须是有效时间');
  const reviewerUserId = Number(input.reviewerUserId || actorUserId);
  if (!Number.isInteger(reviewerUserId) || reviewerUserId <= 0 || !queryOne('SELECT id FROM users WHERE id = ?', [reviewerUserId])) {
    throw new TypeError('reviewer_user_id 不存在');
  }
  return {
    usageTaskId: text(input.usageTaskId || existing?.usage_task_id, 200),
    measurementScope: text(input.measurementScope || existing?.measurement_scope || 'default', 100),
    reviewerUserId,
    traditionalMinutes,
    traditionalBaselineType: baselineType,
    baselineSourceNote,
    fuxiTotalMinutes,
    aiOrPlatformMinutes: hasBreakdown ? breakdown[0] : null,
    manualReviewMinutes: hasBreakdown ? breakdown[1] : null,
    reworkMinutes: hasBreakdown ? breakdown[2] : null,
    comparable,
    exclusionReason: comparable ? null : exclusionReason,
    evidenceNote,
    measuredAt: new Date(measuredAt).toISOString()
  };
}

function serialize(row) {
  if (!row) return null;
  const traditional = row.traditional_minutes == null ? null : Number(row.traditional_minutes);
  const fuxi = Number(row.fuxi_total_minutes);
  return {
    id: row.id, usageTaskId: row.usage_task_id, measurementScope: row.measurement_scope,
    recorderUserId: Number(row.recorder_user_id), reviewerUserId: Number(row.reviewer_user_id),
    traditionalMinutes: traditional, traditionalBaselineType: row.traditional_baseline_type || null,
    baselineSourceNote: row.baseline_source_note || null, fuxiTotalMinutes: fuxi,
    aiOrPlatformMinutes: row.ai_or_platform_minutes == null ? null : Number(row.ai_or_platform_minutes),
    manualReviewMinutes: row.manual_review_minutes == null ? null : Number(row.manual_review_minutes),
    reworkMinutes: row.rework_minutes == null ? null : Number(row.rework_minutes),
    comparable: Boolean(row.comparable), exclusionReason: row.exclusion_reason || null,
    evidenceNote: row.evidence_note || null, measuredAt: row.measured_at,
    recordedAt: row.recorded_at, createdAt: row.created_at, updatedAt: row.updated_at,
    timeSavingRate: row.comparable && traditional > 0 ? Number((((traditional - fuxi) / traditional) * 100).toFixed(1)) : null,
    task: row.task_kind ? { id: row.usage_task_id, taskKind: row.task_kind, sourceRef: row.source_ref, actorUserId: Number(row.actor_user_id), actorName: row.actor_nickname || row.actor_username || null } : undefined
  };
}

function createEfficiencyComparison(input, { actorUserId } = {}) {
  if (!actorUserId) throw new TypeError('recorder identity 不能为空');
  const values = normalizeInput(input, { actorUserId });
  const task = taskForComparison(values.usageTaskId);
  assertEffectiveTask(task);
  const timestamp = now();
  const comparisonId = id('effcmp');
  const row = { id: comparisonId, ...values, recorderUserId: Number(actorUserId), recordedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
  runInTransaction(db => {
    db.run(`INSERT INTO efficiency_comparisons
      (id, usage_task_id, measurement_scope, recorder_user_id, reviewer_user_id, traditional_minutes,
       traditional_baseline_type, baseline_source_note, fuxi_total_minutes, ai_or_platform_minutes,
       manual_review_minutes, rework_minutes, comparable, exclusion_reason, evidence_note, measured_at,
       recorded_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.usageTaskId, row.measurementScope, row.recorderUserId, row.reviewerUserId, row.traditionalMinutes,
      row.traditionalBaselineType, row.baselineSourceNote, row.fuxiTotalMinutes, row.aiOrPlatformMinutes,
      row.manualReviewMinutes, row.reworkMinutes, row.comparable ? 1 : 0, row.exclusionReason, row.evidenceNote,
      row.measuredAt, row.recordedAt, row.createdAt, row.updatedAt]);
    db.run(`INSERT INTO efficiency_comparison_audits
      (id, comparison_id, actor_user_id, action, change_reason, before_json, after_json, created_at)
      VALUES (?, ?, ?, 'created', 'initial_record', NULL, ?, ?)`,
    [id('effaudit'), row.id, actorUserId, JSON.stringify(row), timestamp]);
  });
  return getEfficiencyComparison(comparisonId);
}

function updateEfficiencyComparison(comparisonId, input, { actorUserId } = {}) {
  const existing = queryOne('SELECT * FROM efficiency_comparisons WHERE id = ?', [comparisonId]);
  if (!existing) throw Object.assign(new Error('效率样本不存在'), { code: 'EFFICIENCY_COMPARISON_NOT_FOUND' });
  const changeReason = text(input.changeReason, 500);
  if (!changeReason) throw new TypeError('修改效率样本必须填写 change_reason');
  const values = normalizeInput({ ...serialize(existing), ...input, usageTaskId: existing.usage_task_id, measurementScope: existing.measurement_scope }, { actorUserId, existing });
  assertEffectiveTask(taskForComparison(existing.usage_task_id));
  const timestamp = now();
  runInTransaction(db => {
    db.run(`UPDATE efficiency_comparisons SET reviewer_user_id=?, traditional_minutes=?, traditional_baseline_type=?,
      baseline_source_note=?, fuxi_total_minutes=?, ai_or_platform_minutes=?, manual_review_minutes=?, rework_minutes=?,
      comparable=?, exclusion_reason=?, evidence_note=?, measured_at=?, updated_at=? WHERE id=?`,
    [values.reviewerUserId, values.traditionalMinutes, values.traditionalBaselineType, values.baselineSourceNote,
      values.fuxiTotalMinutes, values.aiOrPlatformMinutes, values.manualReviewMinutes, values.reworkMinutes,
      values.comparable ? 1 : 0, values.exclusionReason, values.evidenceNote, values.measuredAt, timestamp, comparisonId]);
    db.run(`INSERT INTO efficiency_comparison_audits
      (id, comparison_id, actor_user_id, action, change_reason, before_json, after_json, created_at)
      VALUES (?, ?, ?, 'updated', ?, ?, ?, ?)`,
    [id('effaudit'), comparisonId, actorUserId, changeReason, JSON.stringify(serialize(existing)), JSON.stringify(values), timestamp]);
  });
  return getEfficiencyComparison(comparisonId);
}

function comparisonRows(where = '', params = []) {
  return query(`SELECT c.*, t.task_kind, t.source_ref, t.actor_user_id, u.username AS actor_username, u.nickname AS actor_nickname
    FROM efficiency_comparisons c
    JOIN usage_tasks t ON t.id=c.usage_task_id LEFT JOIN users u ON u.id=t.actor_user_id ${where}
    ORDER BY c.measured_at DESC, c.id DESC`, params);
}
function getEfficiencyComparison(idValue) { return serialize(comparisonRows('WHERE c.id = ?', [idValue])[0]); }

function getEfficiencyAnalysis({ from, to, measurementScope = 'default', recentLimit = 20 } = {}) {
  const recordClauses = ['c.measurement_scope = ?'];
  const recordParams = [measurementScope];
  if (from) { recordClauses.push('c.measured_at >= ?'); recordParams.push(from); }
  if (to) { recordClauses.push('c.measured_at < ?'); recordParams.push(to); }
  const records = comparisonRows(`WHERE ${recordClauses.join(' AND ')}`, recordParams).map(serialize);
  const clauses = ["c.measurement_scope = ?", "c.comparable = 1", "c.traditional_minutes > 0", "t.status = 'completed'", 't.is_test = 0', "COALESCE(t.exclusion_reason, '') = ''"];
  const params = [measurementScope];
  if (from) { clauses.push('c.measured_at >= ?'); params.push(from); }
  if (to) { clauses.push('c.measured_at < ?'); params.push(to); }
  const comparable = comparisonRows(`WHERE ${clauses.join(' AND ')}`, params).map(serialize);
  const traditionalTotal = comparable.reduce((sum, row) => sum + row.traditionalMinutes, 0);
  const fuxiTotal = comparable.reduce((sum, row) => sum + row.fuxiTotalMinutes, 0);
  const candidates = query(`SELECT t.id, t.task_kind, t.source_ref, t.actor_user_id, t.completed_at,
      u.username AS actor_username, u.nickname AS actor_nickname, c.id AS comparison_id
    FROM usage_tasks t LEFT JOIN users u ON u.id=t.actor_user_id
    LEFT JOIN efficiency_comparisons c ON c.usage_task_id=t.id AND c.measurement_scope=?
    WHERE t.status='completed' AND t.is_test=0 AND COALESCE(t.exclusion_reason, '')=''
    ORDER BY t.completed_at DESC`, [measurementScope]).map(row => ({
      id: row.id, taskKind: row.task_kind, sourceRef: row.source_ref, actorUserId: Number(row.actor_user_id),
      actorName: row.actor_nickname || row.actor_username || null, completedAt: row.completed_at,
      comparisonId: row.comparison_id || null
    }));
  const limit = Math.min(100, Math.max(1, Number(recentLimit) || 20));
  return {
    generatedAt: now(), measurementScope,
    formula: '(SUM(traditional_minutes) - SUM(fuxi_total_minutes)) / SUM(traditional_minutes)',
    inclusionRules: ["comparison.comparable = 1", 'traditional_minutes > 0', "task.status = 'completed'", 'task.is_test = 0', "COALESCE(task.exclusion_reason, '') = ''"],
    summary: {
      comparableSampleCount: comparable.length,
      traditionalTotalMinutes: traditionalTotal,
      traditionalAverageMinutes: comparable.length ? Number((traditionalTotal / comparable.length).toFixed(2)) : null,
      fuxiTotalMinutes: fuxiTotal,
      fuxiAverageMinutes: comparable.length ? Number((fuxiTotal / comparable.length).toFixed(2)) : null,
      absoluteSavedMinutes: comparable.length ? Number((traditionalTotal - fuxiTotal).toFixed(2)) : null,
      aggregateTimeSavingRate: traditionalTotal > 0 ? Number((((traditionalTotal - fuxiTotal) / traditionalTotal) * 100).toFixed(1)) : null
    },
    rateDistribution: comparable.map(row => ({ comparisonId: row.id, usageTaskId: row.usageTaskId, timeSavingRate: row.timeSavingRate })),
    recentSamples: records.slice(0, limit), candidates
  };
}

function getComparisonAudits(comparisonId) {
  return query('SELECT * FROM efficiency_comparison_audits WHERE comparison_id=? ORDER BY created_at, id', [comparisonId]);
}

module.exports = { BASELINE_TYPES, createEfficiencyComparison, updateEfficiencyComparison, getEfficiencyComparison, getEfficiencyAnalysis, getComparisonAudits };
