const crypto = require('crypto');
const { query, queryOne, runInTransaction } = require('../database/db');

const OUTCOMES = new Set(['pass', 'partial', 'fail']);

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`; }
function text(value, max = 500) {
  const result = String(value ?? '').trim();
  return result ? result.slice(0, max) : null;
}
function boolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return value === true || value === 1 || value === '1';
}

function taskForReview(taskId) {
  return queryOne(`SELECT t.*, u.username AS actor_username, u.nickname AS actor_nickname
    FROM usage_tasks t LEFT JOIN users u ON u.id=t.actor_user_id WHERE t.id=?`, [taskId]);
}

function assertEffectiveTask(task) {
  if (!task) throw Object.assign(new Error('usage task 不存在'), { code: 'USAGE_TASK_NOT_FOUND' });
  if (task.status !== 'completed' || Number(task.is_test) !== 0 || text(task.exclusion_reason)) {
    throw Object.assign(new Error('只能复核 completed 且未标记测试/排除的 usage task'), { code: 'USAGE_TASK_NOT_EFFECTIVE' });
  }
}

function reviewerSnapshot(actorUserId) {
  const reviewer = queryOne('SELECT id, username, nickname, role FROM users WHERE id=?', [actorUserId]);
  if (!reviewer) throw new TypeError('reviewer identity 不存在');
  return JSON.stringify({ id: Number(reviewer.id), username: reviewer.username, nickname: reviewer.nickname || null, role: reviewer.role });
}

function normalizeInput(input, { actorUserId, existing = null } = {}) {
  const outcome = text(input.outcome || existing?.outcome, 20);
  if (!OUTCOMES.has(outcome)) throw new TypeError('outcome 必须是 pass、partial 或 fail');
  const included = boolean(input.included, existing ? Boolean(existing.included) : true);
  const exclusionReason = text(input.exclusionReason !== undefined ? input.exclusionReason : existing?.exclusion_reason, 300);
  const reviewNote = text(input.reviewNote !== undefined ? input.reviewNote : existing?.review_note, 2000);
  if (!reviewNote) throw new TypeError('review_note 不能为空');
  if (!included && !exclusionReason) throw new TypeError('不计入正式统计时必须填写 exclusion_reason');
  const reviewedAt = text(input.reviewedAt || existing?.reviewed_at || now(), 50);
  if (Number.isNaN(new Date(reviewedAt).getTime())) throw new TypeError('reviewed_at 必须是有效时间');
  return {
    usageTaskId: text(input.usageTaskId || existing?.usage_task_id, 200),
    measurementScope: text(input.measurementScope || existing?.measurement_scope || 'default', 100),
    reviewerUserId: Number(actorUserId), reviewerSnapshotJson: reviewerSnapshot(actorUserId), outcome,
    severeError: boolean(input.severeError, existing ? Boolean(existing.severe_error) : false),
    artifactType: text(input.artifactType !== undefined ? input.artifactType : existing?.artifact_type, 80),
    artifactRef: text(input.artifactRef !== undefined ? input.artifactRef : existing?.artifact_ref, 300),
    included, exclusionReason: included ? null : exclusionReason, reviewNote,
    reviewedAt: new Date(reviewedAt).toISOString()
  };
}

function formalState(row) {
  const taskEligible = row.task_status === 'completed' && Number(row.task_is_test) === 0 && !text(row.task_exclusion_reason);
  const formallyIncluded = Boolean(row.included) && taskEligible;
  let reason = null;
  if (!formallyIncluded) {
    if (row.task_status !== 'completed') reason = `task_status:${row.task_status}`;
    else if (Number(row.task_is_test) !== 0) reason = 'task_is_test';
    else if (text(row.task_exclusion_reason)) reason = row.task_exclusion_reason;
    else reason = row.exclusion_reason || 'review_not_included';
  }
  return { currentlyEligibleTask: taskEligible, includedInFormalAggregate: formallyIncluded, formalExclusionReason: reason };
}

function serialize(row) {
  if (!row) return null;
  const state = row.task_status === undefined ? {} : formalState(row);
  let snapshot = null;
  try { snapshot = JSON.parse(row.reviewer_snapshot_json); } catch (error) {}
  return {
    id: row.id, usageTaskId: row.usage_task_id, measurementScope: row.measurement_scope,
    reviewerUserId: Number(row.reviewer_user_id), reviewerSnapshot: snapshot,
    outcome: row.outcome, severeError: Boolean(row.severe_error), artifactType: row.artifact_type || null,
    artifactRef: row.artifact_ref || null, included: Boolean(row.included), exclusionReason: row.exclusion_reason || null,
    reviewNote: row.review_note, reviewedAt: row.reviewed_at, recordedAt: row.recorded_at,
    createdAt: row.created_at, updatedAt: row.updated_at, ...state,
    task: row.task_kind ? {
      id: row.usage_task_id, taskKind: row.task_kind, sourceRef: row.source_ref,
      actorUserId: Number(row.actor_user_id), actorName: row.actor_nickname || row.actor_username || null,
      status: row.task_status, isTest: Boolean(row.task_is_test), exclusionReason: row.task_exclusion_reason || null,
      completedAt: row.task_completed_at
    } : undefined
  };
}

function reviewRows(where = '', params = []) {
  return query(`SELECT r.*, t.task_kind, t.source_ref, t.actor_user_id, t.status AS task_status,
      t.is_test AS task_is_test, t.exclusion_reason AS task_exclusion_reason, t.completed_at AS task_completed_at,
      u.username AS actor_username, u.nickname AS actor_nickname
    FROM accuracy_review_cases r JOIN usage_tasks t ON t.id=r.usage_task_id
    LEFT JOIN users u ON u.id=t.actor_user_id ${where}
    ORDER BY r.reviewed_at DESC, r.id DESC`, params);
}

function getAccuracyReview(idValue) { return serialize(reviewRows('WHERE r.id=?', [idValue])[0]); }

function createAccuracyReview(input, { actorUserId } = {}) {
  if (!actorUserId) throw new TypeError('reviewer identity 不能为空');
  const values = normalizeInput(input, { actorUserId });
  assertEffectiveTask(taskForReview(values.usageTaskId));
  const timestamp = now();
  const row = { id: id('accrev'), ...values, recordedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
  try {
    runInTransaction(db => {
      db.run(`INSERT INTO accuracy_review_cases
        (id,usage_task_id,measurement_scope,reviewer_user_id,reviewer_snapshot_json,outcome,severe_error,
         artifact_type,artifact_ref,included,exclusion_reason,review_note,reviewed_at,recorded_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [row.id,row.usageTaskId,row.measurementScope,row.reviewerUserId,row.reviewerSnapshotJson,row.outcome,row.severeError?1:0,
        row.artifactType,row.artifactRef,row.included?1:0,row.exclusionReason,row.reviewNote,row.reviewedAt,row.recordedAt,row.createdAt,row.updatedAt]);
      db.run(`INSERT INTO accuracy_review_case_audits
        (id,review_case_id,actor_user_id,action,change_reason,before_json,after_json,created_at)
        VALUES (?,?,?,'created','initial_record',NULL,?,?)`,
      [id('accaudit'),row.id,actorUserId,JSON.stringify(row),timestamp]);
    });
  } catch (error) {
    if (/UNIQUE constraint failed/.test(error.message)) error.code = 'ACCURACY_REVIEW_DUPLICATE';
    throw error;
  }
  return getAccuracyReview(row.id);
}

function updateAccuracyReview(reviewId, input, { actorUserId } = {}) {
  const existing = queryOne('SELECT * FROM accuracy_review_cases WHERE id=?', [reviewId]);
  if (!existing) throw Object.assign(new Error('准确性复核不存在'), { code: 'ACCURACY_REVIEW_NOT_FOUND' });
  const changeReason = text(input.changeReason, 500);
  if (!changeReason) throw new TypeError('修改准确性复核必须填写 change_reason');
  assertEffectiveTask(taskForReview(existing.usage_task_id));
  const values = normalizeInput(input, { actorUserId, existing });
  const timestamp = now();
  runInTransaction(db => {
    db.run(`UPDATE accuracy_review_cases SET reviewer_user_id=?,reviewer_snapshot_json=?,outcome=?,severe_error=?,
      artifact_type=?,artifact_ref=?,included=?,exclusion_reason=?,review_note=?,reviewed_at=?,updated_at=? WHERE id=?`,
    [values.reviewerUserId,values.reviewerSnapshotJson,values.outcome,values.severeError?1:0,values.artifactType,
      values.artifactRef,values.included?1:0,values.exclusionReason,values.reviewNote,values.reviewedAt,timestamp,reviewId]);
    db.run(`INSERT INTO accuracy_review_case_audits
      (id,review_case_id,actor_user_id,action,change_reason,before_json,after_json,created_at)
      VALUES (?,?,?,'updated',?,?,?,?)`,
    [id('accaudit'),reviewId,actorUserId,changeReason,JSON.stringify(serialize(existing)),JSON.stringify(values),timestamp]);
  });
  return getAccuracyReview(reviewId);
}

function getAccuracyAnalysis({ from, to, measurementScope = 'default', recentLimit = 20 } = {}) {
  const period = ['r.measurement_scope=?'];
  const periodParams = [measurementScope];
  if (from) { period.push('t.completed_at>=?'); periodParams.push(from); }
  if (to) { period.push('t.completed_at<?'); periodParams.push(to); }
  const recent = reviewRows(`WHERE ${period.join(' AND ')}`, periodParams).map(serialize);
  const formalClauses = [...period, 'r.included=1', "t.status='completed'", 't.is_test=0', "COALESCE(t.exclusion_reason,'')=''" ];
  const formal = reviewRows(`WHERE ${formalClauses.join(' AND ')}`, periodParams).map(serialize);
  const counts = { pass: 0, partial: 0, fail: 0 };
  formal.forEach(row => { counts[row.outcome] += 1; });
  const candidateClauses = ["t.status='completed'", 't.is_test=0', "COALESCE(t.exclusion_reason,'')=''" ];
  const candidateParams = [measurementScope];
  if (from) { candidateClauses.push('t.completed_at>=?'); candidateParams.push(from); }
  if (to) { candidateClauses.push('t.completed_at<?'); candidateParams.push(to); }
  const candidates = query(`SELECT t.id,t.task_kind,t.source_ref,t.actor_user_id,t.completed_at,
      u.username AS actor_username,u.nickname AS actor_nickname,r.id AS review_id
    FROM usage_tasks t LEFT JOIN users u ON u.id=t.actor_user_id
    LEFT JOIN accuracy_review_cases r ON r.usage_task_id=t.id AND r.measurement_scope=?
    WHERE ${candidateClauses.join(' AND ')} ORDER BY t.completed_at DESC`, candidateParams).map(row => ({
      id: row.id, taskKind: row.task_kind, sourceRef: row.source_ref, actorUserId: Number(row.actor_user_id),
      actorName: row.actor_nickname || row.actor_username || null, completedAt: row.completed_at, reviewId: row.review_id || null
    }));
  const limit = Math.min(100, Math.max(1, Number(recentLimit) || 20));
  return {
    generatedAt: now(), measurementScope, periodAnchor: 'usage_tasks.completed_at', formula: 'pass_count / reviewed_count',
    inclusionRules: ["usage_tasks.completed_at >= from AND usage_tasks.completed_at < to", 'review.included = 1', "task.status = 'completed'", 'task.is_test = 0', "COALESCE(task.exclusion_reason, '') = ''"],
    summary: { reviewedCount: formal.length, passCount: counts.pass, partialCount: counts.partial, failCount: counts.fail,
      accuracyRate: formal.length ? Number(((counts.pass / formal.length) * 100).toFixed(1)) : null,
      severeErrorCount: formal.filter(row => row.severeError).length },
    outcomeDistribution: Object.entries(counts).map(([outcome, count]) => ({ outcome, count })),
    recentReviews: recent.slice(0, limit), severeErrorReviews: formal.filter(row => row.severeError), candidates
  };
}

function getAccuracyReviewAudits(reviewId) {
  return query('SELECT * FROM accuracy_review_case_audits WHERE review_case_id=? ORDER BY created_at,id', [reviewId]);
}

module.exports = { OUTCOMES, createAccuracyReview, updateAccuracyReview, getAccuracyReview, getAccuracyAnalysis, getAccuracyReviewAudits };
