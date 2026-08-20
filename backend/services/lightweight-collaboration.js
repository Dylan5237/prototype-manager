const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { query, queryOne, runInTransaction } = require('../database/db');
const { ACTIONS, AuthorizationError, AuthorizationService, normalizeRoles } = require('./authorization');
const { getPrototypeById, createVersion, getLatestVersionNumber, updatePrototype } = require('./db-prototypes');
const { getProjectById } = require('./db-projects');
const { REPOS_DIR, UPLOADS_DIR, findEntryFile, getDirSizeKb } = require('./storage');

const DEFAULT_CANDIDATES_ROOT = path.join(UPLOADS_DIR, 'collaboration-candidates');
const HANDOFF_TTL_MS = 10 * 60 * 1000;
const MAX_REQUIREMENT_LENGTH = 4000;
const MAX_ZIP_ENTRIES = 5000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

class LightweightCollaborationError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'LightweightCollaborationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function now() {
  return new Date().toISOString();
}

function normalizeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isPlatformAdmin(actor) {
  return normalizeRoles(actor && (actor.roles || actor.role)).includes('admin');
}

function insertAudit(db, { actorUserId, action, resourceId, result = 'success', metadata = {} }) {
  db.run(`
    INSERT INTO audit_events
      (id, actor_user_id, action, resource_type, resource_id, result, metadata_json, created_at)
    VALUES (?, ?, ?, 'prototype_change', ?, ?, ?, ?)
  `, [crypto.randomUUID(), actorUserId, action, String(resourceId), result, JSON.stringify(metadata), now()]);
}

function copyTree(source, target, { exclude = new Set() } = {}) {
  fs.mkdirSync(target, { recursive: true });
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    if (exclude.has(item.name)) continue;
    const src = path.join(source, item.name);
    const dest = path.join(target, item.name);
    if (item.isDirectory()) copyTree(src, dest, { exclude });
    else if (item.isFile()) fs.copyFileSync(src, dest);
  }
}

function assertSafeZip(zip) {
  const entries = zip.getEntries();
  if (!entries.length) throw new LightweightCollaborationError('CANDIDATE_INVALID', '候选 ZIP 为空');
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new LightweightCollaborationError('CANDIDATE_INVALID', '候选 ZIP 文件数量过多');
  }
  let total = 0;
  for (const entry of entries) {
    const raw = String(entry.entryName || '').replace(/\\/g, '/');
    const parts = raw.split('/').filter(Boolean);
    if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || parts.includes('..')) {
      throw new LightweightCollaborationError('CANDIDATE_INVALID', '候选 ZIP 包含非法路径');
    }
    if (parts[0] === 'versions' || parts[0] === '.git' || parts.includes('node_modules')) {
      throw new LightweightCollaborationError('CANDIDATE_INVALID', '候选 ZIP 包含禁止目录');
    }
    total += Number(entry.header && entry.header.size) || 0;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      throw new LightweightCollaborationError('CANDIDATE_INVALID', '候选 ZIP 解压后体积过大');
    }
  }
}

function resolveContentRoot(extractedRoot) {
  if (findEntryFile(extractedRoot)) return extractedRoot;
  const items = fs.readdirSync(extractedRoot, { withFileTypes: true });
  if (items.length === 1 && items[0].isDirectory()) {
    const nested = path.join(extractedRoot, items[0].name);
    if (findEntryFile(nested)) return nested;
  }
  return extractedRoot;
}

function decorateChange(row) {
  if (!row) return null;
  return {
    ...row,
    base_version_number: Number(row.base_version_number || 0),
    candidate_size_kb: row.candidate_size_kb == null ? null : Number(row.candidate_size_kb),
    preview_path: row.candidate_entry_file
      ? `/preview/changes/${encodeURIComponent(row.id)}/${row.candidate_entry_file}`
      : null
  };
}

function getChangeContext(change) {
  const project = getProjectById(change.project_id);
  const prototype = getPrototypeById(change.prototype_id);
  const binding = queryOne(`
    SELECT menu_path FROM project_prototypes
    WHERE project_id = ? AND prototype_id = ?
    LIMIT 1
  `, [change.project_id, change.prototype_id]);
  return { project, prototype, binding };
}

function buildPrompt({ change, handoffCode, expiresAt }) {
  const { project, prototype, binding } = getChangeContext(change);
  const projectName = project && project.name ? project.name : change.project_id;
  const prototypeName = prototype && prototype.name ? prototype.name : change.prototype_id;
  const menuPath = binding && binding.menu_path ? binding.menu_path : '未设置';
  return [
    '你是伏羲原型修改 Agent。请严格按下面的任务完成一次“候选版本”交付。',
    '',
    '【任务上下文】',
    `- 项目：${projectName}（${change.project_id}）`,
    `- 原型：${prototypeName}（${change.prototype_id}）`,
    `- 菜单路径：${menuPath}`,
    `- 任务 ID：${change.id}`,
    `- 基础版本：v${change.base_version_number}`,
    `- 任务码：${handoffCode}`,
    `- 任务码有效期：${expiresAt}`,
    '',
    '【必须执行的步骤】',
    '1. 调用 redeem_change_handoff，参数 handoffCode 使用上面的任务码。',
    '2. 领取成功后，使用返回的 sourceDownloadUrl 下载当前正式版本源码；不要凭空重建原型。',
    '3. 在源码基础上实现“修改要求”，先本地检查入口、相对路径和主要交互。',
    '4. 将完整候选产物打成 ZIP，调用 submit_change_candidate 上传；参数必须使用本任务的 projectId、changeId，并传入 ZIP 的本地路径。',
    '5. 上传成功后调用 get_change_status 确认状态为 ready；候选会进入伏羲页面等待负责人预览和采纳。',
    '',
    '【交付约束】',
    '- 这是候选版本，绝对不要直接覆盖正式版本，也不要调用正式版本上传接口。',
    '- ZIP 必须包含可预览入口 index.html 或系统识别的 HTML 入口，路径使用相对路径。',
    '- ZIP 不得包含 .git、versions、node_modules 或绝对路径；不要把凭证、密码、长期 token 写入产物。',
    '- 保持未涉及页面和交互不变；如果需求存在歧义，优先保留现有行为并在完成说明中指出。',
    '',
    '【修改要求】',
    change.requirement,
    '',
    '【完成说明】',
    '上传候选后，请返回：已领取任务、修改摘要、验证结果、ZIP 路径和候选状态。不要自行宣称已上线；最终是否采用由项目负责人决定。'
  ].join('\n');
}

function getChangeById(changeId) {
  return decorateChange(queryOne(`
    SELECT c.*, creator.username AS creator_username, creator.nickname AS creator_name,
      reviewer.nickname AS reviewer_name,
      handoff.status AS handoff_status, handoff.expires_at AS handoff_expires_at,
      (SELECT COALESCE(MAX(version_number), 0) FROM prototype_versions WHERE prototype_id = c.prototype_id) AS current_version_number
    FROM prototype_changes c
    LEFT JOIN users creator ON creator.id = c.created_by
    LEFT JOIN users reviewer ON reviewer.id = c.reviewed_by
    LEFT JOIN agent_handoffs handoff ON handoff.id = c.handoff_id
    WHERE c.id = ?
  `, [changeId]));
}

function listChanges(projectId, { prototypeId, status } = {}) {
  const clauses = ['c.project_id = ?', "c.branch_name LIKE 'no-git/%'"];
  const params = [projectId];
  if (prototypeId) { clauses.push('c.prototype_id = ?'); params.push(prototypeId); }
  if (status) { clauses.push('c.status = ?'); params.push(status); }
  return query(`
    SELECT c.*, p.name AS prototype_name, creator.username AS creator_username,
      creator.nickname AS creator_name,
      handoff.status AS handoff_status, handoff.expires_at AS handoff_expires_at,
      (SELECT COALESCE(MAX(version_number), 0) FROM prototype_versions WHERE prototype_id = c.prototype_id) AS current_version_number
    FROM prototype_changes c
    JOIN prototypes p ON p.id = c.prototype_id
    LEFT JOIN users creator ON creator.id = c.created_by
    LEFT JOIN agent_handoffs handoff ON handoff.id = c.handoff_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY c.updated_at DESC
  `, params).map(decorateChange);
}

class LightweightCollaborationService {
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

  assertCanManageTask(actor, action, change) {
    this.authorization.assertCan(actor, action, {
      type: 'change', projectId: change.project_id, prototypeId: change.prototype_id
    });
    const project = getProjectById(change.project_id);
    if (!isPlatformAdmin(actor) && (!project || Number(project.created_by) !== Number(actor.id)) && Number(change.created_by) !== Number(actor.id)) {
      throw new AuthorizationError(action, { type: 'change' });
    }
  }

  createChange({ actor, projectId, prototypeId, title, requirement }) {
    const cleanRequirement = String(requirement || '').trim();
    if (!cleanRequirement || cleanRequirement.length > MAX_REQUIREMENT_LENGTH) {
      throw new LightweightCollaborationError('INVALID_REQUIREMENT', '修改目标不能为空且不能超过 4000 字');
    }
    this.authorization.assertCan(actor, ACTIONS.START_CHANGE, { type: 'change', projectId, prototypeId });
    const prototype = getPrototypeById(prototypeId);
    const binding = queryOne(
      'SELECT id FROM project_prototypes WHERE project_id = ? AND prototype_id = ? LIMIT 1',
      [projectId, prototypeId]
    );
    if (!prototype || !binding) {
      throw new LightweightCollaborationError('PROTOTYPE_NOT_IN_PROJECT', '原型不属于该项目', 404);
    }

    const createdAt = this.clock().toISOString();
    const expiresAt = new Date(this.clock().getTime() + HANDOFF_TTL_MS).toISOString();
    const changeId = normalizeId('chg');
    const handoffId = normalizeId('handoff');
    const handoffCode = `FX-${crypto.randomBytes(18).toString('base64url')}`;
    const baseVersion = getLatestVersionNumber(prototypeId);
    const cleanTitle = String(title || cleanRequirement).trim().slice(0, 120);

    runInTransaction(db => {
      db.run(`
        INSERT INTO agent_handoffs
          (id, code_hash, project_id, prototype_id, created_by, requirement, status, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?)
      `, [handoffId, hashValue(handoffCode), projectId, prototypeId, actor.id, cleanRequirement, expiresAt, createdAt]);
      db.run(`
        INSERT INTO prototype_changes
          (id, project_id, prototype_id, handoff_id, title, requirement, created_by,
           branch_name, base_sha, base_version_number, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'editing', ?, ?)
      `, [
        changeId, projectId, prototypeId, handoffId, cleanTitle, cleanRequirement, actor.id,
        `no-git/${changeId}`, `version:${baseVersion}`, baseVersion, createdAt, createdAt
      ]);
      insertAudit(db, {
        actorUserId: actor.id,
        action: 'change.created',
        resourceId: changeId,
        metadata: { projectId, prototypeId, baseVersion }
      });
    });

    const change = getChangeById(changeId);
    return {
      change,
      handoffCode,
      expiresAt,
      prompt: buildPrompt({ change, handoffCode, expiresAt })
    };
  }

  updateChange({ actor, projectId, changeId, title, requirement }) {
    const change = this.getChange({ actor, projectId, changeId });
    this.assertCanManageTask(actor, ACTIONS.EDIT_CHANGE, change);
    if (change.status !== 'editing') {
      throw new LightweightCollaborationError('CHANGE_NOT_EDITABLE', '任务已领取或已结束，不能再修改', 409);
    }
    if (change.handoff_status === 'redeemed') {
      throw new LightweightCollaborationError('CHANGE_ALREADY_REDEEMED', '任务已被 AI 领取，不能再修改', 409);
    }
    const cleanRequirement = String(requirement || '').trim();
    if (!cleanRequirement || cleanRequirement.length > MAX_REQUIREMENT_LENGTH) {
      throw new LightweightCollaborationError('INVALID_REQUIREMENT', '修改目标不能为空且不能超过 4000 字');
    }
    const cleanTitle = String(title || cleanRequirement).trim().slice(0, 120);
    const updatedAt = this.clock().toISOString();
    const expiresAt = new Date(this.clock().getTime() + HANDOFF_TTL_MS).toISOString();
    const handoffCode = `FX-${crypto.randomBytes(18).toString('base64url')}`;
    runInTransaction(db => {
      const handoff = queryOne('SELECT status FROM agent_handoffs WHERE id = ?', [change.handoff_id]);
      if (!handoff || handoff.status === 'redeemed') {
        throw new LightweightCollaborationError('CHANGE_ALREADY_REDEEMED', '任务已被 AI 领取，不能再修改', 409);
      }
      db.run(`
        UPDATE agent_handoffs
        SET code_hash = ?, requirement = ?, status = 'created', expires_at = ?,
            redeemed_at = NULL, created_at = ?
        WHERE id = ?
      `, [hashValue(handoffCode), cleanRequirement, expiresAt, updatedAt, change.handoff_id]);
      db.run(`
        UPDATE prototype_changes
        SET title = ?, requirement = ?, updated_at = ?
        WHERE id = ? AND status = 'editing'
      `, [cleanTitle, cleanRequirement, updatedAt, changeId]);
      insertAudit(db, {
        actorUserId: actor.id,
        action: 'change.updated',
        resourceId: changeId,
        metadata: { projectId, prototypeId: change.prototype_id, baseVersion: change.base_version_number }
      });
    });
    const updated = getChangeById(changeId);
    return {
      change: updated,
      handoffCode,
      expiresAt,
      prompt: buildPrompt({ change: updated, handoffCode, expiresAt })
    };
  }

  cancelChange({ actor, projectId, changeId }) {
    const change = this.getChange({ actor, projectId, changeId });
    this.assertCanManageTask(actor, ACTIONS.DELETE_CHANGE, change);
    if (change.status !== 'editing') {
      throw new LightweightCollaborationError('CHANGE_NOT_CANCELLABLE', '只有未完成任务可以删除', 409);
    }
    if (change.handoff_status === 'redeemed') {
      throw new LightweightCollaborationError('CHANGE_ALREADY_REDEEMED', '任务已被 AI 领取，不能删除', 409);
    }
    runInTransaction(db => {
      db.run(`
        UPDATE prototype_changes
        SET status = 'cancelled', closed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'editing'
      `, [now(), now(), changeId]);
      db.run("UPDATE agent_handoffs SET status = 'revoked' WHERE id = ? AND status <> 'redeemed'", [change.handoff_id]);
      insertAudit(db, {
        actorUserId: actor.id,
        action: 'change.cancelled',
        resourceId: changeId,
        metadata: { projectId, prototypeId: change.prototype_id, baseVersion: change.base_version_number }
      });
    });
    return getChangeById(changeId);
  }

  redeemHandoff({ actor, handoffCode }) {
    const code = String(handoffCode || '').trim();
    if (!code) throw new LightweightCollaborationError('HANDOFF_CODE_REQUIRED', '任务码不能为空');
    const codeHash = hashValue(code);
    const existing = queryOne('SELECT * FROM agent_handoffs WHERE code_hash = ?', [codeHash]);
    if (!existing) throw new LightweightCollaborationError('HANDOFF_NOT_FOUND', '任务码不存在', 404);
    if (Number(existing.created_by) !== Number(actor.id) && !isPlatformAdmin(actor)) {
      throw new LightweightCollaborationError('HANDOFF_USER_MISMATCH', '该任务不属于当前用户', 403);
    }
    if (existing.status === 'redeemed') {
      throw new LightweightCollaborationError('HANDOFF_ALREADY_REDEEMED', '任务码已经使用');
    }
    if (existing.status !== 'created') {
      throw new LightweightCollaborationError('HANDOFF_NOT_ACTIVE', '任务码不可用');
    }
    if (new Date(existing.expires_at).getTime() <= this.clock().getTime()) {
      runInTransaction(db => db.run("UPDATE agent_handoffs SET status = 'expired' WHERE id = ?", [existing.id]));
      throw new LightweightCollaborationError('HANDOFF_EXPIRED', '任务码已过期');
    }
    const redeemedAt = this.clock().toISOString();
    let changeId;
    runInTransaction(db => {
      const handoff = queryOne('SELECT * FROM agent_handoffs WHERE code_hash = ?', [codeHash]);
      if (!handoff || handoff.status !== 'created') {
        throw new LightweightCollaborationError('HANDOFF_ALREADY_REDEEMED', '任务码已经使用');
      }
      this.authorization.assertCan(actor, ACTIONS.START_CHANGE, {
        type: 'change', projectId: handoff.project_id, prototypeId: handoff.prototype_id
      });
      db.run("UPDATE agent_handoffs SET status = 'redeemed', redeemed_at = ? WHERE id = ?", [redeemedAt, handoff.id]);
      const change = queryOne('SELECT id FROM prototype_changes WHERE handoff_id = ?', [handoff.id]);
      changeId = change && change.id;
      insertAudit(db, {
        actorUserId: actor.id,
        action: 'handoff.redeemed',
        resourceId: changeId,
        metadata: { projectId: handoff.project_id, prototypeId: handoff.prototype_id }
      });
    });
    const change = getChangeById(changeId);
    return {
      change,
      sourceDownloadPath: `/api/prototypes/${encodeURIComponent(change.prototype_id)}/download`
    };
  }

  getChange({ actor, projectId, changeId }) {
    const change = getChangeById(changeId);
    if (!change || String(change.project_id) !== String(projectId)) {
      throw new LightweightCollaborationError('CHANGE_NOT_FOUND', '候选不存在', 404);
    }
    this.authorization.assertCan(actor, ACTIONS.VIEW_CHANGE, {
      type: 'change', projectId, prototypeId: change.prototype_id
    });
    return change;
  }

  listChanges({ actor, projectId, prototypeId, status }) {
    this.authorization.assertCan(actor, ACTIONS.VIEW_CHANGE, { type: 'change', projectId, prototypeId });
    return listChanges(projectId, { prototypeId, status });
  }

  submitCandidate({ actor, projectId, changeId, zipPath }) {
    const change = this.getChange({ actor, projectId, changeId });
    this.authorization.assertCan(actor, ACTIONS.SUBMIT_CHANGE, {
      type: 'change', projectId, prototypeId: change.prototype_id
    });
    if (Number(change.created_by) !== Number(actor.id) && !isPlatformAdmin(actor)) {
      throw new LightweightCollaborationError('CHANGE_USER_MISMATCH', '只能提交自己发起的修改', 403);
    }
    if (change.status !== 'editing') {
      throw new LightweightCollaborationError('CHANGE_NOT_EDITABLE', '当前修改不能再上传候选', 409);
    }
    const handoff = queryOne('SELECT status FROM agent_handoffs WHERE id = ?', [change.handoff_id]);
    if (!handoff || handoff.status !== 'redeemed') {
      throw new LightweightCollaborationError('HANDOFF_NOT_REDEEMED', '请先领取任务');
    }
    if (!zipPath || !fs.existsSync(zipPath)) {
      throw new LightweightCollaborationError('CANDIDATE_FILE_MISSING', '候选 ZIP 不存在');
    }

    fs.mkdirSync(this.candidatesRoot, { recursive: true });
    const staging = path.join(this.candidatesRoot, `.staging-${changeId}-${crypto.randomUUID()}`);
    const finalDir = path.join(this.candidatesRoot, changeId);
    let contentRoot = staging;
    let movedToFinal = false;
    try {
      const zip = new AdmZip(zipPath);
      assertSafeZip(zip);
      fs.mkdirSync(staging, { recursive: true });
      zip.extractAllTo(staging, true);
      contentRoot = resolveContentRoot(staging);
      const entryFile = findEntryFile(contentRoot);
      if (!entryFile) throw new LightweightCollaborationError('CANDIDATE_INVALID', '候选中未找到可预览入口');
      const digest = hashValue(fs.readFileSync(zipPath));
      const sizeKb = getDirSizeKb(contentRoot);
      if (fs.existsSync(finalDir)) {
        throw new LightweightCollaborationError('CANDIDATE_ALREADY_EXISTS', '候选目录已存在', 409);
      }
      runInTransaction(db => {
        const current = queryOne('SELECT status FROM prototype_changes WHERE id = ?', [changeId]);
        if (!current || current.status !== 'editing') {
          throw new LightweightCollaborationError('CHANGE_NOT_EDITABLE', '当前修改不能再上传候选', 409);
        }
        if (contentRoot !== staging) fs.renameSync(contentRoot, finalDir);
        else fs.renameSync(staging, finalDir);
        movedToFinal = true;
        db.run(`
          UPDATE prototype_changes
          SET status = 'ready', candidate_path = ?, candidate_entry_file = ?, candidate_digest = ?,
              candidate_size_kb = ?, submitted_at = ?, updated_at = ?
          WHERE id = ?
        `, [changeId, entryFile, digest, sizeKb, now(), now(), changeId]);
        insertAudit(db, {
          actorUserId: actor.id,
          action: 'candidate.ready',
          resourceId: changeId,
          metadata: { projectId, prototypeId: change.prototype_id, baseVersion: change.base_version_number, entryFile, digest }
        });
      });
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      return getChangeById(changeId);
    } catch (error) {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      if (movedToFinal && fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true, force: true });
      if (!(error instanceof LightweightCollaborationError)) {
        throw new LightweightCollaborationError('CANDIDATE_INVALID', '候选 ZIP 校验失败');
      }
      throw error;
    }
  }

  rejectChange({ actor, projectId, changeId, note }) {
    const change = this.getChange({ actor, projectId, changeId });
    this.authorization.assertCan(actor, ACTIONS.REVIEW_CHANGE, {
      type: 'change', projectId, prototypeId: change.prototype_id
    });
    if (change.status !== 'ready') {
      throw new LightweightCollaborationError('CHANGE_ALREADY_FINAL', '只有待确认候选可以退回', 409);
    }
    runInTransaction(db => {
      db.run(`
        UPDATE prototype_changes
        SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'ready'
      `, [actor.id, String(note || '').trim().slice(0, 1000), now(), now(), changeId]);
      insertAudit(db, {
        actorUserId: actor.id,
        action: 'change.rejected',
        resourceId: changeId,
        metadata: { projectId, prototypeId: change.prototype_id, baseVersion: change.base_version_number }
      });
    });
    return getChangeById(changeId);
  }

  adoptChange({ actor, projectId, changeId }) {
    const initial = this.getChange({ actor, projectId, changeId });
    this.authorization.assertCan(actor, ACTIONS.REVIEW_CHANGE, {
      type: 'change', projectId, prototypeId: initial.prototype_id
    });
    if (initial.status !== 'ready') {
      throw new LightweightCollaborationError('CHANGE_ALREADY_FINAL', '只有待确认候选可以采用', 409);
    }
    const storedCandidatePath = String(initial.candidate_path || '');
    const candidateDir = path.isAbsolute(storedCandidatePath)
      ? path.resolve(storedCandidatePath)
      : path.resolve(this.candidatesRoot, storedCandidatePath);
    if (!candidateDir.startsWith(`${this.candidatesRoot}${path.sep}`) || !fs.existsSync(candidateDir)) {
      throw new LightweightCollaborationError('CANDIDATE_FILE_MISSING', '候选文件不存在', 409);
    }

    const repoDir = path.join(this.reposRoot, initial.prototype_id);
    fs.mkdirSync(this.reposRoot, { recursive: true });
    const nonce = crypto.randomUUID();
    const staging = path.join(this.reposRoot, `.adopt-${changeId}-${nonce}-stage`);
    const backup = path.join(this.reposRoot, `.adopt-${changeId}-${nonce}-backup`);
    let swapped = false;
    let hadCurrent = false;
    let committed = false;
    try {
      copyTree(candidateDir, staging, { exclude: new Set(['versions']) });
      const currentVersions = path.join(repoDir, 'versions');
      if (fs.existsSync(currentVersions)) copyTree(currentVersions, path.join(staging, 'versions'));

      const result = runInTransaction(db => {
        const change = queryOne('SELECT * FROM prototype_changes WHERE id = ?', [changeId]);
        if (!change || change.status !== 'ready') {
          throw new LightweightCollaborationError('CHANGE_ALREADY_FINAL', '候选状态已经变化', 409);
        }
        const currentVersion = getLatestVersionNumber(change.prototype_id);
        if (Number(currentVersion) !== Number(change.base_version_number || 0)) {
          db.run(`
            UPDATE prototype_changes SET status = 'stale', reviewed_by = ?, reviewed_at = ?, updated_at = ?
            WHERE id = ?
          `, [actor.id, now(), now(), changeId]);
          insertAudit(db, {
            actorUserId: actor.id,
            action: 'change.stale',
            resourceId: changeId,
            metadata: { projectId, prototypeId: change.prototype_id, baseVersion: change.base_version_number, currentVersion }
          });
          return { stale: true, currentVersion };
        }

        const nextVersion = currentVersion + 1;
        copyTree(candidateDir, path.join(staging, 'versions', `v${nextVersion}`), { exclude: new Set(['versions']) });
        if (fs.existsSync(repoDir)) {
          fs.renameSync(repoDir, backup);
          hadCurrent = true;
        }
        fs.renameSync(staging, repoDir);
        swapped = true;

        const version = createVersion({
          prototypeId: change.prototype_id,
          versionNumber: nextVersion,
          entryFile: change.candidate_entry_file,
          syncSource: 'collaboration_candidate',
          createdBy: actor.id,
          sizeKb: change.candidate_size_kb,
          note: change.title,
          versionType: 'patch'
        });
        db.run(`
          UPDATE prototype_versions
          SET source_kind = 'collaboration_candidate', artifact_digest = ?
          WHERE id = ?
        `, [change.candidate_digest, version.id]);
        updatePrototype(change.prototype_id, {
          entryFile: change.candidate_entry_file,
          syncStatus: 'uploaded'
        });
        db.run(`
          UPDATE prototype_changes
          SET status = 'adopted', reviewed_by = ?, reviewed_at = ?, adopted_version_id = ?,
              merged_sha = ?, merged_at = ?, updated_at = ?
          WHERE id = ?
        `, [actor.id, now(), version.id, change.candidate_digest, now(), now(), changeId]);
        insertAudit(db, {
          actorUserId: actor.id,
          action: 'change.adopted',
          resourceId: changeId,
          metadata: {
            projectId,
            prototypeId: change.prototype_id,
            baseVersion: change.base_version_number,
            adoptedVersion: nextVersion,
            digest: change.candidate_digest
          }
        });
        return { stale: false, version };
      });

      if (result.stale) {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
        throw new LightweightCollaborationError(
          'STALE_BASE_VERSION',
          '当前正式版本已经变化，请基于最新版重新发起',
          409,
          { currentVersion: result.currentVersion }
        );
      }
      committed = true;
      if (hadCurrent && fs.existsSync(backup)) {
        try { fs.rmSync(backup, { recursive: true, force: true }); } catch (cleanupError) { /* 保留已提交结果，后续巡检清理 */ }
      }
      return { change: getChangeById(changeId), prototype: getPrototypeById(initial.prototype_id), version: result.version };
    } catch (error) {
      if (swapped && !committed) {
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
        if (hadCurrent && fs.existsSync(backup)) fs.renameSync(backup, repoDir);
      }
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      if (!(error instanceof LightweightCollaborationError)) {
        throw new LightweightCollaborationError('ADOPTION_FAILED', '采用失败，当前正式版本已恢复', 500);
      }
      throw error;
    }
  }
}

module.exports = {
  DEFAULT_CANDIDATES_ROOT,
  LightweightCollaborationError,
  LightweightCollaborationService,
  assertSafeZip,
  getChangeById,
  listChanges
};
