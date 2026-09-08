const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { query, queryOne, runInTransaction } = require('../database/db');
const { ACTIONS, AuthorizationError, AuthorizationService } = require('./authorization');
const { getPrototypeById, createVersion, getLatestVersionNumber, getLatestVersionLabel, updatePrototype } = require('./db-prototypes');
const { REPOS_DIR, findEntryFile, getDirSizeKb } = require('./storage');
const { validateCandidateDirectory } = require('./candidate-validation');
const { resolveVersionLabel } = require('./version-strategy');
const {
  DEFAULT_CANDIDATES_ROOT,
  assertSafeZip,
  copyTree,
  resolveContentRoot
} = require('./lightweight-collaboration');
const { ProjectTaskError } = require('./project-tasks');

const OPEN_TASK_STATUSES = ['assigned', 'in_progress', 'awaiting_review'];
const PENDING_CANDIDATE_STATUSES = ['submitted', 'ready'];

class CandidateReviewError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'CandidateReviewError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function now(clock) {
  return clock().toISOString();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function insertAudit(db, { actorUserId, action, resourceId, result = 'success', metadata = {}, createdAt }) {
  db.run(`
    INSERT INTO audit_events
      (id, actor_user_id, action, resource_type, resource_id, result, metadata_json, created_at)
    VALUES (?, ?, ?, 'candidate_submission', ?, ?, ?, ?)
  `, [crypto.randomUUID(), actorUserId, action, String(resourceId), result, JSON.stringify(metadata), createdAt]);
}

function selectTask(taskId) {
  return queryOne(`
    SELECT pt.*, pn.label AS node_label, pp.prototype_id, pp.menu_path, p.name AS prototype_name
    FROM project_tasks pt
    JOIN project_nodes pn ON pn.id = pt.node_id
    JOIN project_prototypes pp ON pp.id = pt.binding_id
    JOIN prototypes p ON p.id = pp.prototype_id
    WHERE pt.id = ?
  `, [taskId]);
}

function decorateCandidate(row) {
  if (!row) return null;
  const validations = query(`
    SELECT * FROM candidate_validations WHERE candidate_id = ? ORDER BY attempt_no
  `, [row.id]).map(item => ({
    ...item,
    errors: parseJson(item.errors_json, []),
    warnings: parseJson(item.warnings_json, []),
    stats: parseJson(item.stats_json, {})
  }));
  const decision = queryOne(`
    SELECT rd.*, reviewer.username AS reviewer_username, reviewer.nickname AS reviewer_name
    FROM review_decisions rd
    LEFT JOIN users reviewer ON reviewer.id = rd.reviewer_id
    WHERE rd.candidate_id = ?
  `, [row.id]);
  return {
    ...row,
    base_version_number: Number(row.base_version_number || 0),
    artifact_size_kb: row.artifact_size_kb == null ? null : Number(row.artifact_size_kb),
    validations,
    decision,
    preview_path: row.artifact_entry_file
      ? `/preview/candidates/${encodeURIComponent(row.id)}/${row.artifact_entry_file}`
      : null
  };
}

function getCandidateRow(candidateId) {
  return queryOne(`
    SELECT cs.*, pt.project_id, pt.binding_id, pt.node_id, pt.title AS task_title,
      pt.version_strategy_type, pt.version_strategy_value, pt.status AS task_status,
      pp.prototype_id, submitter.username AS submitter_username, submitter.nickname AS submitter_name
    FROM candidate_submissions cs
    JOIN project_tasks pt ON pt.id = cs.task_id
    JOIN project_prototypes pp ON pp.id = pt.binding_id
    LEFT JOIN users submitter ON submitter.id = cs.submitted_by
    WHERE cs.id = ?
  `, [candidateId]);
}

function getCandidateById(candidateId) {
  return decorateCandidate(getCandidateRow(candidateId));
}

function listCandidatesForTask(taskId) {
  return query(`
    SELECT cs.*, pt.project_id, pt.binding_id, pt.node_id, pt.title AS task_title,
      pt.version_strategy_type, pt.version_strategy_value, pt.status AS task_status,
      pp.prototype_id, submitter.username AS submitter_username, submitter.nickname AS submitter_name
    FROM candidate_submissions cs
    JOIN project_tasks pt ON pt.id = cs.task_id
    JOIN project_prototypes pp ON pp.id = pt.binding_id
    LEFT JOIN users submitter ON submitter.id = cs.submitted_by
    WHERE cs.task_id = ?
    ORDER BY cs.submission_no
  `, [taskId]).map(decorateCandidate);
}

function resolveCandidateDirectory(candidate, candidatesRoot) {
  if (!candidate || !candidate.artifact_path) return null;
  const root = path.resolve(candidatesRoot);
  const candidateDir = path.isAbsolute(candidate.artifact_path)
    ? path.resolve(candidate.artifact_path)
    : path.resolve(root, candidate.artifact_path);
  if (!candidateDir.startsWith(`${root}${path.sep}`) && candidateDir !== root) return null;
  return candidateDir;
}

function countPendingReview(taskId) {
  return Number(queryOne(
    `SELECT COUNT(*) AS count FROM candidate_submissions WHERE task_id = ? AND status IN ('submitted','ready')`,
    [taskId]
  ).count || 0);
}

function getAcceptedResponsible(taskId, userId) {
  return queryOne(`
    SELECT * FROM task_assignments
    WHERE task_id = ? AND user_id = ? AND assignment_role = 'responsible'
      AND acceptance_status = 'accepted'
    ORDER BY id DESC LIMIT 1
  `, [taskId, Number(userId)]);
}

class CandidateReviewService {
  constructor({
    authorization = new AuthorizationService(),
    candidatesRoot = DEFAULT_CANDIDATES_ROOT,
    reposRoot = REPOS_DIR,
    clock = () => new Date()
  } = {}) {
    this.authorization = authorization;
    this.candidatesRoot = path.resolve(candidatesRoot);
    this.reposRoot = path.resolve(reposRoot);
    this.clock = clock;
  }

  assertProjectView(actor, projectId, prototypeId) {
    this.authorization.assertCan(actor, ACTIONS.VIEW_CHANGE, { type: 'candidate', projectId, prototypeId });
  }

  getCandidate({ actor, projectId, candidateId }) {
    const candidate = getCandidateById(candidateId);
    if (!candidate || String(candidate.project_id) !== String(projectId)) {
      throw new CandidateReviewError('CANDIDATE_NOT_FOUND', '候选不存在', 404);
    }
    this.assertProjectView(actor, projectId, candidate.prototype_id);
    return candidate;
  }

  listCandidates({ actor, projectId, taskId }) {
    const task = selectTask(taskId);
    if (!task || String(task.project_id) !== String(projectId)) {
      throw new ProjectTaskError('TASK_NOT_FOUND', '任务不存在', 404);
    }
    this.assertProjectView(actor, projectId, task.prototype_id);
    return listCandidatesForTask(taskId);
  }

  submitCandidate({ actor, projectId, taskId, zipPath, versionType }) {
    const task = selectTask(taskId);
    if (!task || String(task.project_id) !== String(projectId)) {
      throw new ProjectTaskError('TASK_NOT_FOUND', '任务不存在', 404);
    }
    this.authorization.assertCan(actor, ACTIONS.SUBMIT_CHANGE, {
      type: 'candidate', projectId, prototypeId: task.prototype_id
    });
    if (!getAcceptedResponsible(taskId, actor.id)) {
      throw new CandidateReviewError('CANDIDATE_SUBMIT_FORBIDDEN', '仅当前任务负责人可以提交候选', 403);
    }
    if (!['in_progress', 'awaiting_review'].includes(task.status)) {
      throw new CandidateReviewError('TASK_STATUS_CONFLICT', '当前任务状态不能提交候选', 409);
    }
    if (task.version_strategy_type === 'auto' && versionType && !['major', 'minor', 'patch'].includes(versionType)) {
      throw new CandidateReviewError('INVALID_VERSION_TYPE', 'versionType 只能是 major、minor 或 patch');
    }
    if (task.version_strategy_type === 'custom' && versionType) {
      throw new CandidateReviewError('INVALID_VERSION_TYPE', '自定义版本策略不需要传入 versionType');
    }
    if (!zipPath || !fs.existsSync(zipPath)) {
      throw new CandidateReviewError('CANDIDATE_FILE_MISSING', '候选 ZIP 不存在');
    }

    const handoff = queryOne(`
      SELECT * FROM project_task_handoffs
      WHERE task_id = ? AND issued_to_user_id = ? AND status IN ('issued','redeemed')
      ORDER BY created_at DESC LIMIT 1
    `, [taskId, actor.id]);
    const candidateId = normalizeId('cand');
    const createdAt = now(this.clock);
    const nextNo = Number(queryOne(
      `SELECT COALESCE(MAX(submission_no), 0) AS max_no FROM candidate_submissions WHERE task_id = ?`,
      [taskId]
    ).max_no || 0) + 1;
    const relativePath = `${taskId}/${candidateId}`;
    const staging = path.join(this.candidatesRoot, `.staging-${candidateId}`);
    const finalDir = path.join(this.candidatesRoot, taskId, candidateId);
    let contentRoot = staging;
    let persisted = false;

    try {
      const zip = new AdmZip(zipPath);
      assertSafeZip(zip);
      fs.mkdirSync(staging, { recursive: true });
      zip.extractAllTo(staging, true);
      contentRoot = resolveContentRoot(staging);
      const entryFile = findEntryFile(contentRoot);
      const digest = hashValue(fs.readFileSync(zipPath));
      const sizeKb = getDirSizeKb(contentRoot);
      const validation = entryFile
        ? validateCandidateDirectory(contentRoot, entryFile)
        : {
          ok: false,
          mode: 'static',
          errors: [{ code: 'ENTRY_FILE_MISSING', message: '候选中未找到可预览入口' }],
          warnings: [],
          filesChecked: 0,
          referencesChecked: 0
        };
      const candidateStatus = validation.ok ? 'ready' : 'validation_failed';
      fs.mkdirSync(path.dirname(finalDir), { recursive: true });
      if (fs.existsSync(finalDir)) throw new CandidateReviewError('CANDIDATE_ALREADY_EXISTS', '候选目录已存在', 409);
      if (contentRoot !== staging) fs.renameSync(contentRoot, finalDir);
      else fs.renameSync(staging, finalDir);
      persisted = true;
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });

      runInTransaction(db => {
        if (handoff && handoff.status === 'issued') {
          db.run(`UPDATE project_task_handoffs SET status = 'redeemed', redeemed_at = ? WHERE id = ? AND status = 'issued'`, [createdAt, handoff.id]);
        }
        db.run(`
          INSERT INTO candidate_submissions
            (id, task_id, submission_no, submitted_by, handoff_id, base_version_id, base_version_number,
             artifact_path, artifact_digest, artifact_entry_file, artifact_size_kb, chosen_version_type,
             status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          candidateId, taskId, nextNo, actor.id, handoff ? handoff.id : null, task.base_version_id, task.base_version_number,
          relativePath, digest, entryFile || null, sizeKb, versionType || null, candidateStatus, createdAt, createdAt
        ]);
        db.run(`
          INSERT INTO candidate_validations
            (id, candidate_id, attempt_no, mode, status, errors_json, warnings_json, stats_json, source, created_at)
          VALUES (?, ?, 1, 'static', ?, ?, ?, ?, 'server', ?)
        `, [
          normalizeId('cval'), candidateId, validation.ok ? 'passed' : 'failed',
          JSON.stringify(validation.errors || []), JSON.stringify(validation.warnings || []),
          JSON.stringify({ filesChecked: validation.filesChecked, referencesChecked: validation.referencesChecked }),
          createdAt
        ]);
        if (validation.ok) {
          db.run(`UPDATE project_tasks SET status = 'awaiting_review', updated_at = ? WHERE id = ?`, [createdAt, taskId]);
        }
        insertAudit(db, {
          actorUserId: actor.id,
          action: validation.ok ? 'candidate.ready' : 'candidate.validation_failed',
          result: validation.ok ? 'success' : 'failure',
          resourceId: candidateId,
          metadata: { projectId, taskId, submissionNo: nextNo, errorCount: (validation.errors || []).length },
          createdAt
        });
      });

      const candidate = getCandidateById(candidateId);
      if (!validation.ok) {
        throw new CandidateReviewError('CANDIDATE_INVALID', '候选静态预检失败', 400, {
          candidateId,
          validationMode: validation.mode,
          errors: validation.errors,
          warnings: validation.warnings,
          filesChecked: validation.filesChecked,
          referencesChecked: validation.referencesChecked,
          candidate
        });
      }
      return candidate;
    } catch (error) {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      if (!persisted && fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true, force: true });
      if (error instanceof CandidateReviewError || error instanceof AuthorizationError || error instanceof ProjectTaskError) throw error;
      throw new CandidateReviewError('CANDIDATE_INVALID', '候选 ZIP 校验失败');
    }
  }

  recordPreviewValidation({ actor, projectId, candidateId, status, errors = [], warnings = [], durationMs = null }) {
    const candidate = this.getCandidate({ actor, projectId, candidateId });
    this.authorization.assertCan(actor, ACTIONS.SUBMIT_CHANGE, {
      type: 'candidate', projectId, prototypeId: candidate.prototype_id
    });
    if (!['passed', 'failed'].includes(status)) {
      throw new CandidateReviewError('INVALID_PREVIEW_VALIDATION', '预览校验状态无效');
    }
    const cleanErrors = Array.isArray(errors) ? errors.slice(0, 20).map(item => String(item).slice(0, 500)) : [];
    const cleanWarnings = Array.isArray(warnings) ? warnings.slice(0, 20).map(item => String(item).slice(0, 500)) : [];
    const passed = status === 'passed' && cleanErrors.length === 0;
    const createdAt = now(this.clock);
    runInTransaction(db => {
      const attemptNo = Number(queryOne(
        `SELECT COALESCE(MAX(attempt_no), 0) AS max_no FROM candidate_validations WHERE candidate_id = ?`,
        [candidateId]
      ).max_no || 0) + 1;
      db.run(`
        INSERT INTO candidate_validations
          (id, candidate_id, attempt_no, mode, status, errors_json, warnings_json, stats_json, source, created_at)
        VALUES (?, ?, ?, 'browser', ?, ?, ?, ?, 'client', ?)
      `, [
        normalizeId('cval'), candidateId, attemptNo, passed ? 'passed' : 'failed',
        JSON.stringify(cleanErrors), JSON.stringify(cleanWarnings),
        JSON.stringify({ durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null }),
        createdAt
      ]);
      insertAudit(db, {
        actorUserId: actor.id,
        action: passed ? 'candidate.preview_recorded' : 'candidate.preview_failed',
        result: passed ? 'success' : 'failure',
        resourceId: candidateId,
        metadata: { projectId, forgedReadyIgnored: candidate.status !== 'ready' && passed },
        createdAt
      });
    });
    return getCandidateById(candidateId);
  }

  returnCandidate({ actor, projectId, candidateId, note }) {
    const candidate = this.getCandidate({ actor, projectId, candidateId });
    this.authorization.assertCan(actor, ACTIONS.REVIEW_CHANGE, {
      type: 'candidate', projectId, prototypeId: candidate.prototype_id
    });
    if (candidate.status !== 'ready') {
      throw new CandidateReviewError('CANDIDATE_NOT_REVIEWABLE', '只有待确认候选可以退回', 409);
    }
    if (!actor || actor.id == null) {
      throw new CandidateReviewError('REVIEWER_REQUIRED', '审核必须记录审核人', 403);
    }
    const createdAt = now(this.clock);
    runInTransaction(db => {
      const current = queryOne('SELECT status FROM candidate_submissions WHERE id = ?', [candidateId]);
      if (!current || current.status !== 'ready') {
        throw new CandidateReviewError('CANDIDATE_NOT_REVIEWABLE', '候选状态已经变化', 409);
      }
      db.run(`UPDATE candidate_submissions SET status = 'returned', updated_at = ? WHERE id = ?`, [createdAt, candidateId]);
      db.run(`
        INSERT INTO review_decisions
          (id, candidate_id, reviewer_id, requested_action, result, comment, adopted_version_id, created_at)
        VALUES (?, ?, ?, 'return', 'returned', ?, NULL, ?)
      `, [normalizeId('rdec'), candidateId, actor.id, String(note || '').trim().slice(0, 1000), createdAt]);
      const remainingReady = queryOne(
        `SELECT COUNT(*) AS count FROM candidate_submissions WHERE task_id = ? AND status = 'ready'`,
        [candidate.task_id]
      );
      db.run(
        `UPDATE project_tasks SET status = ?, updated_at = ? WHERE id = ? AND status = 'awaiting_review'`,
        [Number(remainingReady.count) > 0 ? 'awaiting_review' : 'in_progress', createdAt, candidate.task_id]
      );
      insertAudit(db, {
        actorUserId: actor.id,
        action: 'candidate.returned',
        resourceId: candidateId,
        metadata: { projectId, taskId: candidate.task_id },
        createdAt
      });
    });
    return getCandidateById(candidateId);
  }

  adoptCandidate({ actor, projectId, candidateId }) {
    const initial = this.getCandidate({ actor, projectId, candidateId });
    this.authorization.assertCan(actor, ACTIONS.REVIEW_CHANGE, {
      type: 'candidate', projectId, prototypeId: initial.prototype_id
    });
    if (initial.status !== 'ready') {
      throw new CandidateReviewError('CANDIDATE_NOT_REVIEWABLE', '只有待确认候选可以采用', 409);
    }
    if (!actor || actor.id == null) {
      throw new CandidateReviewError('REVIEWER_REQUIRED', '审核必须记录审核人', 403);
    }
    const candidateDir = resolveCandidateDirectory(initial, this.candidatesRoot);
    if (!candidateDir || !fs.existsSync(candidateDir)) {
      throw new CandidateReviewError('CANDIDATE_FILE_MISSING', '候选文件不存在，历史记录不可采用', 409);
    }

    const repoDir = path.join(this.reposRoot, initial.prototype_id);
    fs.mkdirSync(this.reposRoot, { recursive: true });
    const nonce = crypto.randomUUID();
    const staging = path.join(this.reposRoot, `.adopt-${candidateId}-${nonce}-stage`);
    const backup = path.join(this.reposRoot, `.adopt-${candidateId}-${nonce}-backup`);
    let swapped = false;
    let hadCurrent = false;
    let committed = false;
    const createdAt = now(this.clock);
    try {
      copyTree(candidateDir, staging, { exclude: new Set(['versions']) });
      const currentVersions = path.join(repoDir, 'versions');
      if (fs.existsSync(currentVersions)) copyTree(currentVersions, path.join(staging, 'versions'));

      const result = runInTransaction(db => {
        const candidate = queryOne('SELECT * FROM candidate_submissions WHERE id = ?', [candidateId]);
        if (!candidate || candidate.status !== 'ready') {
          throw new CandidateReviewError('CANDIDATE_NOT_REVIEWABLE', '候选状态已经变化', 409);
        }
        const task = queryOne('SELECT * FROM project_tasks WHERE id = ?', [candidate.task_id]);
        const binding = queryOne('SELECT * FROM project_prototypes WHERE id = ?', [task.binding_id]);
        const currentVersion = getLatestVersionNumber(binding.prototype_id);
        if (Number(currentVersion) !== Number(candidate.base_version_number || 0)) {
          db.run(`UPDATE candidate_submissions SET status = 'stale', updated_at = ? WHERE id = ?`, [createdAt, candidateId]);
          insertAudit(db, {
            actorUserId: actor.id,
            action: 'candidate.stale',
            resourceId: candidateId,
            metadata: { projectId, baseVersion: candidate.base_version_number, currentVersion },
            createdAt
          });
          return { stale: true, currentVersion };
        }

        const nextVersion = currentVersion + 1;
        const currentLabel = getLatestVersionLabel(binding.prototype_id);
        let versionLabel;
        try {
          versionLabel = resolveVersionLabel({
            strategyType: task.version_strategy_type || 'auto',
            strategyValue: task.version_strategy_value || null,
            chosenType: candidate.chosen_version_type || 'patch',
            currentLabel
          });
        } catch (error) {
          throw new CandidateReviewError('INVALID_VERSION_STRATEGY', error.message, 409);
        }
        copyTree(candidateDir, path.join(staging, 'versions', `v${nextVersion}`), { exclude: new Set(['versions']) });
        if (fs.existsSync(repoDir)) {
          fs.renameSync(repoDir, backup);
          hadCurrent = true;
        }
        fs.renameSync(staging, repoDir);
        swapped = true;

        const version = createVersion({
          prototypeId: binding.prototype_id,
          versionNumber: nextVersion,
          entryFile: candidate.artifact_entry_file,
          syncSource: 'collaboration_candidate',
          createdBy: actor.id,
          sizeKb: candidate.artifact_size_kb,
          note: task.title,
          versionType: candidate.chosen_version_type || 'patch',
          versionLabel
        });
        db.run(`UPDATE prototype_versions SET source_kind = 'collaboration_candidate', artifact_digest = ? WHERE id = ?`, [candidate.artifact_digest, version.id]);
        updatePrototype(binding.prototype_id, {
          entryFile: candidate.artifact_entry_file,
          syncStatus: 'uploaded'
        });
        db.run(`UPDATE candidate_submissions SET status = 'adopted', updated_at = ? WHERE id = ?`, [createdAt, candidateId]);
        db.run(`
          INSERT INTO review_decisions
            (id, candidate_id, reviewer_id, requested_action, result, comment, adopted_version_id, created_at)
          VALUES (?, ?, ?, 'adopt', 'adopted', NULL, ?, ?)
        `, [normalizeId('rdec'), candidateId, actor.id, version.id, createdAt]);
        db.run(`
          UPDATE candidate_submissions SET status = 'stale', updated_at = ?
          WHERE status = 'ready' AND id <> ? AND base_version_number = ? AND task_id IN (
            SELECT pt.id FROM project_tasks pt
            JOIN project_prototypes pp ON pp.id = pt.binding_id
            WHERE pp.prototype_id = ?
          )
        `, [createdAt, candidateId, candidate.base_version_number, binding.prototype_id]);
        db.run(`UPDATE project_tasks SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`, [createdAt, createdAt, task.id]);
        insertAudit(db, {
          actorUserId: actor.id,
          action: 'candidate.adopted',
          resourceId: candidateId,
          metadata: { projectId, prototypeId: binding.prototype_id, adoptedVersion: nextVersion },
          createdAt
        });
        return { stale: false, version };
      });

      if (result.stale) {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
        throw new CandidateReviewError('STALE_BASE_VERSION', '当前正式版本已经变化，请基于最新版重新发起', 409, { currentVersion: result.currentVersion });
      }
      committed = true;
      if (hadCurrent && fs.existsSync(backup)) {
        try { fs.rmSync(backup, { recursive: true, force: true }); } catch (cleanupError) { /* 保留已提交结果 */ }
      }
      return {
        candidate: getCandidateById(candidateId),
        prototype: getPrototypeById(initial.prototype_id),
        version: result.version
      };
    } catch (error) {
      if (swapped && !committed) {
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
        if (hadCurrent && fs.existsSync(backup)) fs.renameSync(backup, repoDir);
      }
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      if (error instanceof CandidateReviewError || error instanceof AuthorizationError) throw error;
      throw new CandidateReviewError('ADOPTION_FAILED', '采用失败，当前正式版本已恢复', 500);
    }
  }
}

function listOpenTasksForBinding(bindingId) {
  return query(`
    SELECT id, title, status FROM project_tasks
    WHERE binding_id = ? AND status IN ('assigned','in_progress','awaiting_review')
    ORDER BY updated_at DESC
  `, [Number(bindingId)]);
}

function listPendingCandidatesForBinding(bindingId) {
  return query(`
    SELECT cs.id, cs.status, cs.task_id, pt.title
    FROM candidate_submissions cs
    JOIN project_tasks pt ON pt.id = cs.task_id
    WHERE pt.binding_id = ? AND cs.status IN ('submitted','ready')
    ORDER BY cs.updated_at DESC
  `, [Number(bindingId)]);
}

function listOpenTasksForNode(nodeId) {
  return query(`
    SELECT id, title, status FROM project_tasks
    WHERE node_id = ? AND status IN ('assigned','in_progress','awaiting_review')
    ORDER BY updated_at DESC
  `, [nodeId]);
}

function listPendingCandidatesForNode(nodeId) {
  return query(`
    SELECT cs.id, cs.status, cs.task_id
    FROM candidate_submissions cs
    JOIN project_tasks pt ON pt.id = cs.task_id
    WHERE pt.node_id = ? AND cs.status IN ('submitted','ready')
  `, [nodeId]);
}

function listOpenTaskAssignmentsForMember(projectId, userId) {
  return query(`
    SELECT pt.id, pt.title, ta.assignment_role
    FROM task_assignments ta
    JOIN project_tasks pt ON pt.id = ta.task_id
    WHERE pt.project_id = ? AND ta.user_id = ?
      AND ta.acceptance_status IN ('assigned','accepted')
      AND pt.status IN ('assigned','in_progress','awaiting_review')
  `, [projectId, Number(userId)]);
}

module.exports = {
  OPEN_TASK_STATUSES,
  PENDING_CANDIDATE_STATUSES,
  DEFAULT_CANDIDATES_ROOT,
  CandidateReviewError,
  CandidateReviewService,
  getCandidateById,
  listCandidatesForTask,
  resolveCandidateDirectory,
  countPendingReview,
  listOpenTasksForBinding,
  listPendingCandidatesForBinding,
  listOpenTasksForNode,
  listPendingCandidatesForNode,
  listOpenTaskAssignmentsForMember
};
