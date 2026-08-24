const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { query, queryOne, runInTransaction } = require('../database/db');
const {
  getPrototypeById,
  getLatestVersionNumber,
  getLatestVersionLabel,
  createVersion,
  updatePrototype,
  getSharedUserIds
} = require('./db-prototypes');
const { getPrototypeProjectBinding } = require('./db-projects');
const { REPOS_DIR, UPLOADS_DIR, findEntryFile, getDirSizeKb } = require('./storage');
const { validateCandidateDirectory } = require('./candidate-validation');
const { normalizeRoles } = require('./authorization');
const { normalizeVersionStrategy, resolveVersionLabel } = require('./version-strategy');

const DIRECT_CANDIDATES_ROOT = path.join(UPLOADS_DIR, 'prototype-direct-candidates');
const DIRECT_HANDOFF_TTL_MS = 10 * 60 * 1000;
const MAX_REQUIREMENT_LENGTH = 4000;
const MAX_ZIP_ENTRIES = 5000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

class PrototypeDirectChangeError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'PrototypeDirectChangeError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isAdmin(actor) {
  return normalizeRoles(actor && (actor.roles || actor.role)).includes('admin');
}

function canEdit(actor, prototype) {
  if (!actor || !prototype) return false;
  return isAdmin(actor)
    || Number(actor.id) === Number(prototype.created_by)
    || getSharedUserIds(prototype.id).includes(Number(actor.id));
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
  if (!entries.length) throw new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选 ZIP 为空');
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选 ZIP 文件数量过多');
  }
  let total = 0;
  for (const entry of entries) {
    const raw = String(entry.entryName || '').replace(/\\/g, '/');
    const parts = raw.split('/').filter(Boolean);
    if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || parts.includes('..')) {
      throw new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选 ZIP 包含非法路径');
    }
    if (parts[0] === 'versions' || parts[0] === '.git' || parts.includes('node_modules')) {
      throw new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选 ZIP 包含禁止目录');
    }
    total += Number(entry.header && entry.header.size) || 0;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      throw new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选 ZIP 解压后体积过大');
    }
  }
}

function resolveContentRoot(root) {
  if (findEntryFile(root)) return root;
  const items = fs.readdirSync(root, { withFileTypes: true });
  if (items.length === 1 && items[0].isDirectory()) {
    const nested = path.join(root, items[0].name);
    if (findEntryFile(nested)) return nested;
  }
  return root;
}

function parseJson(value, fallback = []) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function decorate(row) {
  if (!row) return null;
  return {
    ...row,
    base_version_number: Number(row.base_version_number || 0),
    candidate_size_kb: row.candidate_size_kb == null ? null : Number(row.candidate_size_kb),
    validation_errors: parseJson(row.validation_errors_json),
    validation_warnings: parseJson(row.validation_warnings_json),
    preview_path: row.candidate_entry_file
      ? `/preview/direct-changes/${encodeURIComponent(row.id)}/${row.candidate_entry_file}`
      : null
  };
}

function getDirectChangeById(changeId) {
  return decorate(queryOne(`
    SELECT c.*, p.name AS prototype_name, p.entry_file AS current_entry_file,
      h.status AS handoff_status, h.expires_at AS handoff_expires_at,
      h.redeemed_at AS handoff_redeemed_at,
      (SELECT COALESCE(MAX(version_number), 0) FROM prototype_versions WHERE prototype_id = c.prototype_id) AS current_version_number,
      (SELECT version_label FROM prototype_versions WHERE prototype_id = c.prototype_id ORDER BY version_number DESC LIMIT 1) AS current_version_label
    FROM prototype_direct_changes c
    JOIN prototypes p ON p.id = c.prototype_id
    LEFT JOIN prototype_direct_handoffs h ON h.id = c.handoff_id
    WHERE c.id = ?
  `, [changeId]));
}

function buildPrompt(change, handoffCode, expiresAt) {
  const strategy = change.version_strategy_type === 'custom'
    ? `固定使用 v${change.version_strategy_value}`
    : '由你根据实际改动选择 major、minor 或 patch，并在上传时传入 versionType';
  return [
    '你是伏羲原型修改 Agent。请严格完成一次独立原型修改，不要创建项目任务，也不要调用通用 upload_zip 直接覆盖正式版本。',
    '',
    '【任务上下文】',
    `- 原型：${change.prototype_name || change.prototype_id}（${change.prototype_id}）`,
    `- 修改 ID：${change.id}`,
    `- 基线版本：v${change.base_version_number}（领取后锁定）`,
    `- 任务码：${handoffCode}`,
    `- 任务码有效期：${expiresAt}`,
    `- 版本策略：${strategy}`,
    '',
    '【必须执行】',
    '1. 第一调用 redeem_prototype_change_handoff，参数 handoffCode 使用上面的任务码。',
    '2. 领取成功后，使用返回的 sourceDownloadUrl 下载当前正式版本源码；不要凭空重建原型。',
    '3. 在源码基础上实现修改要求，先执行项目自己的构建或静态检查。',
    '4. 调用 validate_project 检查交付目录，再调用 pack_project 生成完整 ZIP。',
    '5. 调用 submit_prototype_change 上传 ZIP；参数必须使用本任务的 prototypeId、changeId，versionType 只能是 major、minor、patch。',
    '6. 上传后等待伏羲页面完成候选预览校验；调用 get_prototype_change_status 确认最终状态为 completed，再报告正式版本。',
    '',
    '【交付约束】',
    '- 这是独立原型修改，平台会在静态校验、浏览器预览和基线版本 CAS 全部通过后自动形成正式版本。',
    '- ZIP 必须包含可预览入口 index.html 或系统识别的 HTML 入口，所有引用必须使用相对路径。',
    '- ZIP 不得包含 .git、versions、node_modules、绝对路径、凭证、密码或长期 token。',
    '- 保持未涉及页面和交互不变；遇到歧义先保留现有行为并在完成说明中指出。',
    '',
    '【修改要求】',
    change.requirement,
    '',
    '【完成说明】',
    '请返回：已领取任务、修改摘要、构建与校验结果、ZIP 路径、versionType 和最终状态。未收到 completed 前不要宣称已上线。'
  ].join('\n');
}

function getCurrentChange(prototypeId, actor) {
  const row = queryOne(`
    SELECT id FROM prototype_direct_changes
    WHERE prototype_id = ? AND created_by = ? AND status NOT IN ('cancelled', 'expired')
    ORDER BY updated_at DESC LIMIT 1
  `, [prototypeId, actor.id]);
  return row ? getDirectChangeById(row.id) : null;
}

class PrototypeDirectChangeService {
  constructor({ candidatesRoot = DIRECT_CANDIDATES_ROOT, reposRoot = REPOS_DIR, clock = () => new Date() } = {}) {
    this.candidatesRoot = path.resolve(candidatesRoot);
    this.reposRoot = path.resolve(reposRoot);
    this.clock = clock;
  }

  assertStandalone(actor, prototypeId) {
    const prototype = getPrototypeById(prototypeId);
    if (!prototype) throw new PrototypeDirectChangeError('PROTOTYPE_NOT_FOUND', '原型不存在', 404);
    if (!canEdit(actor, prototype)) throw new PrototypeDirectChangeError('FORBIDDEN', '无权修改该原型', 403);
    const binding = getPrototypeProjectBinding(prototypeId);
    if (binding) {
      throw new PrototypeDirectChangeError(
        'PROTOTYPE_BOUND_TO_PROJECT',
        `原型已归属项目「${binding.project_name}」，请前往项目内修改`,
        409,
        { projectId: binding.project_id, projectName: binding.project_name, menuPositions: binding.menu_positions }
      );
    }
    return prototype;
  }

  getChangeForActor(actor, changeId) {
    const change = getDirectChangeById(changeId);
    if (!change) throw new PrototypeDirectChangeError('CHANGE_NOT_FOUND', '修改任务不存在', 404);
    if (Number(change.created_by) !== Number(actor.id) && !isAdmin(actor)) {
      throw new PrototypeDirectChangeError('FORBIDDEN', '无权查看该修改任务', 403);
    }
    return change;
  }

  createChange({ actor, prototypeId, requirement, versionStrategy = {} }) {
    const prototype = this.assertStandalone(actor, prototypeId);
    const cleanRequirement = String(requirement || '').trim();
    if (!cleanRequirement || cleanRequirement.length > MAX_REQUIREMENT_LENGTH) {
      throw new PrototypeDirectChangeError('INVALID_REQUIREMENT', '修改目标不能为空且不能超过 4000 字');
    }
    const baseVersion = getLatestVersionNumber(prototypeId);
    const currentLabel = getLatestVersionLabel(prototypeId);
    let strategy;
    try {
      strategy = normalizeVersionStrategy(versionStrategy, currentLabel);
    } catch (error) {
      throw new PrototypeDirectChangeError('INVALID_VERSION_STRATEGY', error.message);
    }
    const createdAt = this.clock().toISOString();
    const expiresAt = new Date(this.clock().getTime() + DIRECT_HANDOFF_TTL_MS).toISOString();
    const changeId = id('direct_chg');
    const handoffId = id('direct_handoff');
    const handoffCode = `FX-${crypto.randomBytes(18).toString('base64url')}`;
    runInTransaction(db => {
      db.run(`
        INSERT INTO prototype_direct_handoffs
          (id, code_hash, prototype_id, created_by, requirement, version_strategy_type,
           version_strategy_value, base_version_number, status, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)
      `, [handoffId, hash(handoffCode), prototypeId, actor.id, cleanRequirement, strategy.type,
        strategy.value, baseVersion, expiresAt, createdAt, createdAt]);
      db.run(`
        INSERT INTO prototype_direct_changes
          (id, handoff_id, prototype_id, created_by, requirement, version_strategy_type,
           version_strategy_value, base_version_number, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'editing', ?, ?)
      `, [changeId, handoffId, prototypeId, actor.id, cleanRequirement, strategy.type,
        strategy.value, baseVersion, createdAt, createdAt]);
    });
    const change = getDirectChangeById(changeId);
    return { change, handoffCode, expiresAt, prompt: buildPrompt(change, handoffCode, expiresAt) };
  }

  updateChange({ actor, changeId, requirement, versionStrategy = {} }) {
    const change = this.getChangeForActor(actor, changeId);
    this.assertStandalone(actor, change.prototype_id);
    if (change.status !== 'editing' || change.handoff_status === 'redeemed') {
      throw new PrototypeDirectChangeError('CHANGE_NOT_EDITABLE', '任务已领取或已结束，不能再修改', 409);
    }
    const cleanRequirement = String(requirement || '').trim();
    if (!cleanRequirement || cleanRequirement.length > MAX_REQUIREMENT_LENGTH) {
      throw new PrototypeDirectChangeError('INVALID_REQUIREMENT', '修改目标不能为空且不能超过 4000 字');
    }
    const currentLabel = getLatestVersionLabel(change.prototype_id);
    let strategy;
    try { strategy = normalizeVersionStrategy(versionStrategy, currentLabel); } catch (error) {
      throw new PrototypeDirectChangeError('INVALID_VERSION_STRATEGY', error.message);
    }
    const baseVersion = getLatestVersionNumber(change.prototype_id);
    const updatedAt = this.clock().toISOString();
    const expiresAt = new Date(this.clock().getTime() + DIRECT_HANDOFF_TTL_MS).toISOString();
    const handoffCode = `FX-${crypto.randomBytes(18).toString('base64url')}`;
    runInTransaction(db => {
      db.run(`
        UPDATE prototype_direct_handoffs
        SET code_hash = ?, requirement = ?, version_strategy_type = ?, version_strategy_value = ?,
            base_version_number = ?, status = 'created', expires_at = ?, redeemed_at = NULL,
            created_at = ?, updated_at = ?
        WHERE id = ? AND status = 'created'
      `, [hash(handoffCode), cleanRequirement, strategy.type, strategy.value, baseVersion,
        expiresAt, updatedAt, updatedAt, change.handoff_id]);
      db.run(`
        UPDATE prototype_direct_changes
        SET requirement = ?, version_strategy_type = ?, version_strategy_value = ?,
            base_version_number = ?, chosen_version_type = NULL, status = 'editing', updated_at = ?
        WHERE id = ? AND status = 'editing'
      `, [cleanRequirement, strategy.type, strategy.value, baseVersion, updatedAt, changeId]);
    });
    const updated = getDirectChangeById(changeId);
    return { change: updated, handoffCode, expiresAt, prompt: buildPrompt(updated, handoffCode, expiresAt) };
  }

  cancelChange({ actor, changeId }) {
    const change = this.getChangeForActor(actor, changeId);
    if (change.status !== 'editing' || change.handoff_status === 'redeemed') {
      throw new PrototypeDirectChangeError('CHANGE_NOT_CANCELLABLE', '只有未领取的修改任务可以取消', 409);
    }
    const timestamp = this.clock().toISOString();
    runInTransaction(db => {
      db.run(`UPDATE prototype_direct_changes SET status = 'cancelled', updated_at = ? WHERE id = ?`, [timestamp, changeId]);
      db.run(`UPDATE prototype_direct_handoffs SET status = 'revoked', updated_at = ? WHERE id = ? AND status = 'created'`, [timestamp, change.handoff_id]);
    });
    return getDirectChangeById(changeId);
  }

  redeemHandoff({ actor, handoffCode }) {
    const code = String(handoffCode || '').trim();
    if (!code) throw new PrototypeDirectChangeError('HANDOFF_CODE_REQUIRED', '任务码不能为空');
    const codeHash = hash(code);
    const existing = queryOne('SELECT * FROM prototype_direct_handoffs WHERE code_hash = ?', [codeHash]);
    if (!existing) throw new PrototypeDirectChangeError('HANDOFF_NOT_FOUND', '任务码不存在', 404);
    if (Number(existing.created_by) !== Number(actor.id) && !isAdmin(actor)) {
      throw new PrototypeDirectChangeError('HANDOFF_USER_MISMATCH', '该任务不属于当前用户', 403);
    }
    if (existing.status !== 'created') {
      throw new PrototypeDirectChangeError('HANDOFF_NOT_ACTIVE', '任务码不可用');
    }
    if (new Date(existing.expires_at).getTime() <= this.clock().getTime()) {
      runInTransaction(db => db.run(`UPDATE prototype_direct_handoffs SET status = 'expired', updated_at = ? WHERE id = ?`, [this.clock().toISOString(), existing.id]));
      throw new PrototypeDirectChangeError('HANDOFF_EXPIRED', '任务码已过期');
    }
    const redeemedAt = this.clock().toISOString();
    runInTransaction(db => {
      const handoff = queryOne('SELECT * FROM prototype_direct_handoffs WHERE code_hash = ?', [codeHash]);
      if (!handoff || handoff.status !== 'created') throw new PrototypeDirectChangeError('HANDOFF_ALREADY_REDEEMED', '任务码已经使用');
      db.run(`UPDATE prototype_direct_handoffs SET status = 'redeemed', redeemed_at = ?, updated_at = ? WHERE id = ?`, [redeemedAt, redeemedAt, handoff.id]);
    });
    const handoff = queryOne('SELECT * FROM prototype_direct_handoffs WHERE id = ?', [existing.id]);
    const changeRow = queryOne('SELECT id FROM prototype_direct_changes WHERE handoff_id = ?', [handoff.id]);
    const change = getDirectChangeById(changeRow.id);
    return {
      change,
      sourceDownloadPath: `/api/prototypes/${encodeURIComponent(change.prototype_id)}/download`
    };
  }

  submitCandidate({ actor, changeId, zipPath, versionType }) {
    const change = this.getChangeForActor(actor, changeId);
    if (!['editing', 'invalid'].includes(change.status)) {
      throw new PrototypeDirectChangeError('CHANGE_NOT_EDITABLE', '当前修改不能再上传候选', 409);
    }
    if (change.handoff_status !== 'redeemed') throw new PrototypeDirectChangeError('HANDOFF_NOT_REDEEMED', '请先领取任务');
    if (change.version_strategy_type === 'auto' && versionType && !['major', 'minor', 'patch'].includes(versionType)) {
      throw new PrototypeDirectChangeError('INVALID_VERSION_TYPE', 'versionType 只能是 major、minor 或 patch');
    }
    if (change.version_strategy_type === 'custom' && versionType) {
      throw new PrototypeDirectChangeError('INVALID_VERSION_TYPE', '自定义版本策略不需要传入 versionType');
    }
    if (!zipPath || !fs.existsSync(zipPath)) throw new PrototypeDirectChangeError('CANDIDATE_FILE_MISSING', '候选 ZIP 不存在');
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
      if (!entryFile) throw new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选中未找到可预览入口');
      const digest = hash(fs.readFileSync(zipPath));
      const sizeKb = getDirSizeKb(contentRoot);
      const validation = validateCandidateDirectory(contentRoot, entryFile);
      const errorsJson = JSON.stringify(validation.errors || []);
      const warningsJson = JSON.stringify(validation.warnings || []);
      if (!validation.ok) {
        runInTransaction(db => db.run(`
          UPDATE prototype_direct_changes
          SET status = 'invalid', validation_status = 'failed', validation_mode = 'static',
              validation_errors_json = ?, validation_warnings_json = ?, validated_at = ?, updated_at = ?
          WHERE id = ? AND status IN ('editing', 'invalid')
        `, [errorsJson, warningsJson, now(), now(), changeId]));
        throw new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选静态预检失败', 400, {
          validationMode: validation.mode, errors: validation.errors, warnings: validation.warnings,
          filesChecked: validation.filesChecked, referencesChecked: validation.referencesChecked
        });
      }
      if (fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true, force: true });
      runInTransaction(db => {
        const current = queryOne('SELECT status FROM prototype_direct_changes WHERE id = ?', [changeId]);
        if (!current || !['editing', 'invalid'].includes(current.status)) throw new PrototypeDirectChangeError('CHANGE_NOT_EDITABLE', '当前修改不能再上传候选', 409);
        if (contentRoot !== staging) fs.renameSync(contentRoot, finalDir);
        else fs.renameSync(staging, finalDir);
        movedToFinal = true;
        db.run(`
          UPDATE prototype_direct_changes
          SET status = 'preview_pending', chosen_version_type = ?, candidate_path = ?, candidate_entry_file = ?,
              candidate_digest = ?, candidate_size_kb = ?, submitted_at = ?, validation_status = 'pending',
              validation_mode = 'static+browser', validation_errors_json = ?, validation_warnings_json = ?,
              validated_at = ?, preview_validated_at = NULL, updated_at = ?
          WHERE id = ?
        `, [versionType || null, changeId, entryFile, digest, sizeKb, now(), errorsJson, warningsJson, now(), now(), changeId]);
      });
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      return getDirectChangeById(changeId);
    } catch (error) {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      if (movedToFinal && fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true, force: true });
      if (error instanceof PrototypeDirectChangeError) throw error;
      throw new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选 ZIP 校验失败');
    }
  }

  recordPreviewValidation({ actor, changeId, status, errors = [], warnings = [], durationMs = null }) {
    const change = this.getChangeForActor(actor, changeId);
    if (!['passed', 'failed'].includes(status)) throw new PrototypeDirectChangeError('INVALID_PREVIEW_VALIDATION', '预览校验状态无效');
    if (change.status === 'completed' && status === 'passed') return { change, prototype: getPrototypeById(change.prototype_id) };
    if (change.status !== 'preview_pending') throw new PrototypeDirectChangeError('CHANGE_NOT_PREVIEW_PENDING', '当前修改不在等待预览校验状态', 409);
    const cleanErrors = Array.isArray(errors) ? errors.slice(0, 20).map(item => String(item).slice(0, 500)) : [];
    const cleanWarnings = Array.isArray(warnings) ? warnings.slice(0, 20).map(item => String(item).slice(0, 500)) : [];
    if (status === 'failed' || cleanErrors.length) {
      runInTransaction(db => db.run(`
        UPDATE prototype_direct_changes
        SET status = 'invalid', validation_status = 'failed', validation_mode = 'browser',
            validation_errors_json = ?, validation_warnings_json = ?, preview_validated_at = ?, updated_at = ?
        WHERE id = ? AND status = 'preview_pending'
      `, [JSON.stringify(cleanErrors), JSON.stringify(cleanWarnings), now(), now(), changeId]));
      return getDirectChangeById(changeId);
    }
    return this.finalizeChange({ actor, changeId, cleanWarnings, durationMs });
  }

  finalizeChange({ actor, changeId, cleanWarnings = [], durationMs = null }) {
    const initial = this.getChangeForActor(actor, changeId);
    const candidatePath = String(initial.candidate_path || '');
    const candidateDir = path.isAbsolute(candidatePath) ? path.resolve(candidatePath) : path.resolve(this.candidatesRoot, candidatePath);
    if (!candidateDir.startsWith(`${this.candidatesRoot}${path.sep}`) || !fs.existsSync(candidateDir)) {
      throw new PrototypeDirectChangeError('CANDIDATE_FILE_MISSING', '候选文件不存在', 409);
    }
    const repoDir = path.join(this.reposRoot, initial.prototype_id);
    fs.mkdirSync(this.reposRoot, { recursive: true });
    const nonce = crypto.randomUUID();
    const staging = path.join(this.reposRoot, `.direct-${changeId}-${nonce}-stage`);
    const backup = path.join(this.reposRoot, `.direct-${changeId}-${nonce}-backup`);
    let swapped = false;
    let hadCurrent = false;
    let committed = false;
    try {
      copyTree(candidateDir, staging, { exclude: new Set(['versions']) });
      const currentVersions = path.join(repoDir, 'versions');
      if (fs.existsSync(currentVersions)) copyTree(currentVersions, path.join(staging, 'versions'));
      const result = runInTransaction(db => {
        const current = queryOne('SELECT * FROM prototype_direct_changes WHERE id = ?', [changeId]);
        if (!current || current.status !== 'preview_pending') throw new PrototypeDirectChangeError('CHANGE_ALREADY_FINAL', '修改状态已经变化', 409);
        const currentVersion = getLatestVersionNumber(current.prototype_id);
        if (Number(currentVersion) !== Number(current.base_version_number || 0)) {
          db.run(`UPDATE prototype_direct_changes SET status = 'stale', updated_at = ? WHERE id = ?`, [now(), changeId]);
          throw new PrototypeDirectChangeError('STALE_BASE_VERSION', '当前正式版本已经变化，请重新生成修改任务', 409, { currentVersion });
        }
        const currentLabel = getLatestVersionLabel(current.prototype_id);
        let versionLabel;
        try {
          versionLabel = resolveVersionLabel({
            strategyType: current.version_strategy_type,
            strategyValue: current.version_strategy_value,
            chosenType: current.chosen_version_type || 'patch',
            currentLabel
          });
        } catch (error) {
          throw new PrototypeDirectChangeError('INVALID_VERSION_STRATEGY', error.message, 409);
        }
        copyTree(candidateDir, path.join(staging, 'versions', `v${currentVersion + 1}`), { exclude: new Set(['versions']) });
        if (fs.existsSync(repoDir)) { fs.renameSync(repoDir, backup); hadCurrent = true; }
        fs.renameSync(staging, repoDir); swapped = true;
        const version = createVersion({
          prototypeId: current.prototype_id,
          versionNumber: currentVersion + 1,
          entryFile: current.candidate_entry_file,
          syncSource: 'prototype_direct_change',
          createdBy: actor.id,
          sizeKb: current.candidate_size_kb,
          note: '独立原型 AI 修改',
          versionType: current.chosen_version_type || 'patch',
          versionLabel
        });
        db.run(`UPDATE prototype_versions SET source_kind = 'prototype_direct_change', artifact_digest = ? WHERE id = ?`, [current.candidate_digest, version.id]);
        updatePrototype(current.prototype_id, { entryFile: current.candidate_entry_file, syncStatus: 'uploaded' });
        db.run(`
          UPDATE prototype_direct_changes
          SET status = 'completed', validation_status = 'passed', validation_mode = 'browser',
              validation_errors_json = '[]', validation_warnings_json = ?, preview_validated_at = ?,
              completed_at = ?, version_id = ?, updated_at = ?
          WHERE id = ?
        `, [JSON.stringify(cleanWarnings), now(), now(), version.id, now(), changeId]);
        db.run(`UPDATE prototype_direct_handoffs SET status = 'completed', updated_at = ? WHERE id = ?`, [now(), current.handoff_id]);
        return { version };
      });
      committed = true;
      if (hadCurrent && fs.existsSync(backup)) { try { fs.rmSync(backup, { recursive: true, force: true }); } catch (error) {} }
      return { change: getDirectChangeById(changeId), prototype: getPrototypeById(initial.prototype_id), version: result.version, durationMs };
    } catch (error) {
      if (swapped && !committed) {
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
        if (hadCurrent && fs.existsSync(backup)) fs.renameSync(backup, repoDir);
      }
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      if (error instanceof PrototypeDirectChangeError) throw error;
      throw new PrototypeDirectChangeError('DELIVERY_FAILED', '正式版本切换失败，当前版本已恢复', 500);
    }
  }
}

module.exports = {
  DIRECT_CANDIDATES_ROOT,
  PrototypeDirectChangeError,
  PrototypeDirectChangeService,
  getDirectChangeById,
  getCurrentChange
};
