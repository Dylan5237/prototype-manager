const crypto = require('crypto');

const COLLABORATION_SCHEMA_VERSION = '20260814_collaboration_phase1';
const LIGHTWEIGHT_COLLABORATION_SCHEMA_VERSION = '20260820_lightweight_collaboration_mvp';
const PROJECT_NODE_SCHEMA_VERSION = '20260907_project_nodes_v1';
const PROJECT_TASK_SCHEMA_VERSION = '20260908_project_tasks_v2';
const CANDIDATE_REVIEW_SCHEMA_VERSION = '20260908_candidate_review_v1';

function now() {
  return new Date().toISOString();
}

function getColumns(db, tableName) {
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  const columns = new Set();
  while (stmt.step()) {
    const row = stmt.getAsObject();
    columns.add(row.name);
  }
  stmt.free();
  return columns;
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = getColumns(db, tableName);
  if (!columns.has(columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function legacyNodeId(projectId, path) {
  return `pnode_${crypto.createHash('sha256').update(`${projectId}:${path}`).digest('hex').slice(0, 20)}`;
}

function allRows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function oneRow(db, sql, params = []) {
  return allRows(db, sql, params)[0] || null;
}

function mapLegacyCandidateStatus(status) {
  if (status === 'ready' || status === 'preview_pending') return 'ready';
  if (status === 'invalid') return 'validation_failed';
  if (status === 'rejected') return 'returned';
  if (status === 'adopted') return 'adopted';
  if (status === 'stale') return 'stale';
  return null;
}

function mapLegacyTaskStatus(status) {
  if (status === 'adopted') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'stale') return 'stale';
  if (status === 'ready' || status === 'preview_pending') return 'awaiting_review';
  if (status === 'editing' || status === 'draft') return 'assigned';
  return 'in_progress';
}

function ensureLegacyBaseVersion(db, change) {
  const prototypeId = change.prototype_id;
  const versionNumber = Number(change.base_version_number || 0);
  if (change.base_version_id) {
    const existing = oneRow(db, 'SELECT id, version_number FROM prototype_versions WHERE id = ?', [change.base_version_id]);
    if (existing) return existing;
  }
  const byNumber = oneRow(db, 'SELECT id, version_number FROM prototype_versions WHERE prototype_id = ? AND version_number = ?', [prototypeId, versionNumber]);
  if (byNumber) return byNumber;
  const latest = oneRow(db, 'SELECT id, version_number FROM prototype_versions WHERE prototype_id = ? ORDER BY version_number DESC LIMIT 1', [prototypeId]);
  if (latest) return latest;
  const t = change.created_at || now();
  db.run(`
    INSERT INTO prototype_versions (prototype_id, version_number, version_label, entry_file, created_by, created_at, source_kind)
    VALUES (?, 0, '0.0.0', '', ?, ?, 'legacy_upload')
  `, [prototypeId, change.created_by || null, t]);
  return oneRow(db, 'SELECT id, version_number FROM prototype_versions WHERE prototype_id = ? AND version_number = 0 ORDER BY id DESC LIMIT 1', [prototypeId]);
}

function resolveLegacyBinding(db, change) {
  if (change.binding_id) {
    const binding = oneRow(db, 'SELECT * FROM project_prototypes WHERE id = ? AND project_id = ?', [Number(change.binding_id), change.project_id]);
    if (binding) return { binding, unresolved: false };
  }
  const bindings = allRows(db, `
    SELECT * FROM project_prototypes
    WHERE project_id = ? AND prototype_id = ? AND unbound_at IS NULL
    ORDER BY id
  `, [change.project_id, change.prototype_id]);
  if (bindings.length === 1) return { binding: bindings[0], unresolved: false };
  return { binding: null, unresolved: true };
}

function migrateLegacyCandidateReview(db) {
  const changes = allRows(db, `SELECT * FROM prototype_changes ORDER BY created_at, id`);
  const insertTask = db.prepare(`
    INSERT OR IGNORE INTO project_tasks
      (id, project_id, node_id, binding_id, base_version_id, base_version_number, requested_by, title, requirement,
       version_strategy_type, version_strategy_value, status, created_at, updated_at, completed_at, cancelled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAssignment = db.prepare(`
    INSERT OR IGNORE INTO task_assignments
      (task_id, user_id, assignment_role, acceptance_status, assigned_by, assigned_at, updated_at)
    VALUES (?, ?, 'responsible', ?, ?, ?, ?)
  `);
  const insertCandidate = db.prepare(`
    INSERT OR IGNORE INTO candidate_submissions
      (id, task_id, submission_no, submitted_by, handoff_id, source_change_id,
       base_version_id, base_version_number, artifact_path, artifact_digest, artifact_entry_file, artifact_size_kb,
       chosen_version_type, status, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertValidation = db.prepare(`
    INSERT OR IGNORE INTO candidate_validations
      (id, candidate_id, attempt_no, mode, status, errors_json, warnings_json, stats_json, source, created_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, '{}', 'migration', ?)
  `);
  const insertDecision = db.prepare(`
    INSERT OR IGNORE INTO review_decisions
      (id, candidate_id, reviewer_id, requested_action, result, comment, adopted_version_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  try {
    for (const change of changes) {
      const { binding, unresolved } = resolveLegacyBinding(db, change);
      if (unresolved || !binding || !binding.node_id) continue;
      const version = ensureLegacyBaseVersion(db, change);
      const taskId = `legacy_task_${change.id}`;
      const taskStatus = mapLegacyTaskStatus(change.status);
      const requestedBy = change.requested_by || change.created_by;
      insertTask.run([
        taskId, change.project_id, binding.node_id, binding.id, version.id, Number(change.base_version_number || version.version_number || 0),
        requestedBy, change.title, change.requirement, change.version_strategy_type || 'auto', change.version_strategy_value || null,
        taskStatus, change.created_at, change.updated_at,
        taskStatus === 'completed' ? (change.merged_at || change.updated_at) : null,
        taskStatus === 'cancelled' ? (change.closed_at || change.updated_at) : null
      ]);
      const assignmentStatus = ['assigned', 'cancelled', 'stale'].includes(taskStatus) ? 'assigned' : 'accepted';
      insertAssignment.run([taskId, change.created_by, assignmentStatus, requestedBy, change.created_at, change.updated_at]);
      const candidateStatus = mapLegacyCandidateStatus(change.status);
      if (!candidateStatus) continue;
      const candidateId = `legacy_candidate_${change.id}`;
      insertCandidate.run([
        candidateId, taskId, change.created_by, change.handoff_id || null, change.id,
        version.id, Number(change.base_version_number || version.version_number || 0),
        change.candidate_path || null, change.candidate_digest || null, change.candidate_entry_file || null, change.candidate_size_kb || null,
        change.chosen_version_type || null, candidateStatus,
        change.submitted_at || change.created_at, change.updated_at
      ]);
      if (change.validation_status || change.validation_mode || change.validation_errors_json || change.validation_warnings_json) {
        insertValidation.run([
          `legacy_validation_${change.id}`, candidateId,
          change.validation_mode || 'legacy_snapshot',
          change.validation_status || (candidateStatus === 'validation_failed' ? 'failed' : 'passed'),
          change.validation_errors_json || '[]',
          change.validation_warnings_json || '[]',
          change.validated_at || change.updated_at
        ]);
      }
      if (candidateStatus === 'returned' || candidateStatus === 'adopted') {
        insertDecision.run([
          `legacy_review_${change.id}`, candidateId, change.reviewed_by || null,
          candidateStatus === 'adopted' ? 'adopt' : 'return',
          candidateStatus === 'adopted' ? 'adopted' : 'returned',
          change.review_note || null, change.adopted_version_id || null,
          change.reviewed_at || change.updated_at
        ]);
      }
    }
  } finally {
    insertTask.free();
    insertAssignment.free();
    insertCandidate.free();
    insertValidation.free();
    insertDecision.free();
  }
}

function migrateProjectNodes(db) {
  const projects = db.exec(`SELECT id, menu_config FROM projects WHERE deleted_at IS NULL`)[0];
  if (!projects) return;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO project_nodes
      (id, project_id, parent_id, node_key, label, node_type, depth, sort_order, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);
  const updateBinding = db.prepare(`
    UPDATE project_prototypes SET node_id = ?
    WHERE project_id = ? AND menu_path = ? AND node_id IS NULL
  `);
  const t = now();
  try {
    for (const rowValues of projects.values) {
      const row = Object.fromEntries(projects.columns.map((name, index) => [name, rowValues[index]]));
      let config;
      try { config = JSON.parse(row.menu_config || '{"items":[]}'); } catch { config = { items: [] }; }
      const walk = (nodes, parentId = null, ancestors = []) => {
        (Array.isArray(nodes) ? nodes : []).forEach((node, index) => {
          const path = [...ancestors, node.key].filter(Boolean).join('/');
          if (!path || ancestors.length >= 3) return;
          const id = node.id || legacyNodeId(row.id, path);
          const children = Array.isArray(node.children) ? node.children : [];
          insert.run([id, row.id, parentId, String(node.key), String(node.label || node.key), children.length ? 'group' : 'work', ancestors.length + 1, index, t, t]);
          updateBinding.run([id, row.id, path]);
          walk(children, id, [...ancestors, node.key]);
        });
      };
      walk(config.items || []);
    }
  } finally {
    insert.free();
    updateBinding.free();
  }
}

function applyCollaborationSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  ensureColumn(db, 'projects', 'published_release_id', 'TEXT');
  ensureColumn(db, 'projects', 'draft_revision', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'projects', 'collaboration_mode', "TEXT NOT NULL DEFAULT 'legacy_checkout'");

  ensureColumn(db, 'prototypes', 'project_id', 'TEXT');
  ensureColumn(db, 'prototypes', 'repo_provider', 'TEXT');
  ensureColumn(db, 'prototypes', 'repo_external_id', 'TEXT');
  ensureColumn(db, 'prototypes', 'repo_path', 'TEXT');
  ensureColumn(db, 'prototypes', 'default_branch', "TEXT NOT NULL DEFAULT 'main'");
  ensureColumn(db, 'prototypes', 'collaboration_status', "TEXT NOT NULL DEFAULT 'legacy'");
  ensureColumn(db, 'project_prototypes', 'unbound_at', 'TEXT');
  ensureColumn(db, 'project_prototypes', 'unbound_by', 'INTEGER');
  ensureColumn(db, 'project_prototypes', 'node_id', 'TEXT');

  ensureColumn(db, 'prototype_versions', 'commit_sha', 'TEXT');
  ensureColumn(db, 'prototype_versions', 'build_id', 'TEXT');
  ensureColumn(db, 'prototype_versions', 'artifact_digest', 'TEXT');
  ensureColumn(db, 'prototype_versions', 'routes_digest', 'TEXT');
  ensureColumn(db, 'prototype_versions', 'source_kind', "TEXT NOT NULL DEFAULT 'legacy_upload'");

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_handoffs (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      prototype_id TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      requirement TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN ('created', 'redeemed', 'expired', 'revoked')),
      expires_at TEXT NOT NULL,
      redeemed_at TEXT,
      delegated_session_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS delegated_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      project_id TEXT NOT NULL,
      prototype_id TEXT NOT NULL,
      handoff_id TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL UNIQUE,
      scopes_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id),
      FOREIGN KEY (handoff_id) REFERENCES agent_handoffs(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_changes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      prototype_id TEXT NOT NULL,
      handoff_id TEXT UNIQUE,
      title TEXT NOT NULL,
      requirement TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      branch_name TEXT NOT NULL,
      base_sha TEXT NOT NULL,
      head_sha TEXT,
      mr_iid INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      current_build_id TEXT,
      merged_sha TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      merged_at TEXT,
      closed_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id),
      FOREIGN KEY (handoff_id) REFERENCES agent_handoffs(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      UNIQUE(prototype_id, branch_name)
    )
  `);

  ensureColumn(db, 'prototype_changes', 'base_version_number', 'INTEGER');
  ensureColumn(db, 'prototype_changes', 'candidate_path', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'candidate_entry_file', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'candidate_digest', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'candidate_size_kb', 'INTEGER');
  ensureColumn(db, 'prototype_changes', 'submitted_at', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'reviewed_by', 'INTEGER');
  ensureColumn(db, 'prototype_changes', 'review_note', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'reviewed_at', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'adopted_version_id', 'INTEGER');
  ensureColumn(db, 'prototype_changes', 'validation_status', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'validation_mode', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'validation_errors_json', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'validation_warnings_json', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'validated_at', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'preview_validated_at', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'version_strategy_type', "TEXT NOT NULL DEFAULT 'auto'");
  ensureColumn(db, 'prototype_changes', 'version_strategy_value', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'chosen_version_type', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'node_id', 'TEXT');
  ensureColumn(db, 'prototype_changes', 'binding_id', 'INTEGER');
  ensureColumn(db, 'prototype_changes', 'base_version_id', 'INTEGER');
  ensureColumn(db, 'prototype_changes', 'requested_by', 'INTEGER');

  db.run(`
    CREATE TABLE IF NOT EXISTS project_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      node_key TEXT NOT NULL,
      label TEXT NOT NULL,
      node_type TEXT NOT NULL CHECK(node_type IN ('group', 'work')),
      depth INTEGER NOT NULL CHECK(depth BETWEEN 1 AND 3),
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (parent_id) REFERENCES project_nodes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS node_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_node_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      assignment_role TEXT NOT NULL CHECK(assignment_role IN ('owner', 'contributor')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      assigned_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_node_id) REFERENCES project_nodes(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (assigned_by) REFERENCES users(id),
      UNIQUE(project_node_id, user_id, assignment_role)
    )
  `);

  migrateProjectNodes(db);

  db.run(`
    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      binding_id INTEGER NOT NULL,
      base_version_id INTEGER NOT NULL,
      base_version_number INTEGER NOT NULL,
      requested_by INTEGER NOT NULL,
      title TEXT NOT NULL,
      requirement TEXT NOT NULL,
      version_strategy_type TEXT NOT NULL DEFAULT 'auto',
      version_strategy_value TEXT,
      status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','awaiting_review','completed','cancelled','stale')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (node_id) REFERENCES project_nodes(id),
      FOREIGN KEY (binding_id) REFERENCES project_prototypes(id),
      FOREIGN KEY (base_version_id) REFERENCES prototype_versions(id),
      FOREIGN KEY (requested_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS task_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      assignment_role TEXT NOT NULL CHECK(assignment_role IN ('responsible','participant')),
      acceptance_status TEXT NOT NULL DEFAULT 'assigned' CHECK(acceptance_status IN ('assigned','accepted','declined','revoked')),
      assigned_by INTEGER NOT NULL,
      assigned_at TEXT NOT NULL,
      responded_at TEXT,
      ended_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES project_tasks(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (assigned_by) REFERENCES users(id),
      UNIQUE(task_id, user_id, assignment_role)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS project_task_handoffs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_assignment_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      issued_by INTEGER NOT NULL,
      issued_to_user_id INTEGER NOT NULL,
      scopes_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','redeemed','expired','revoked')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      redeemed_at TEXT,
      revoked_at TEXT,
      FOREIGN KEY (task_id) REFERENCES project_tasks(id),
      FOREIGN KEY (task_assignment_id) REFERENCES task_assignments(id),
      FOREIGN KEY (issued_by) REFERENCES users(id),
      FOREIGN KEY (issued_to_user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS candidate_submissions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      submission_no INTEGER NOT NULL,
      submitted_by INTEGER NOT NULL,
      handoff_id TEXT,
      source_change_id TEXT UNIQUE,
      base_version_id INTEGER,
      base_version_number INTEGER NOT NULL,
      artifact_path TEXT,
      artifact_digest TEXT,
      artifact_entry_file TEXT,
      artifact_size_kb INTEGER,
      chosen_version_type TEXT,
      usage_attempt_id TEXT,
      status TEXT NOT NULL DEFAULT 'submitted'
        CHECK(status IN ('submitted', 'validation_failed', 'ready', 'returned', 'adopted', 'stale')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES project_tasks(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (base_version_id) REFERENCES prototype_versions(id),
      UNIQUE(task_id, submission_no)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS candidate_validations (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      attempt_no INTEGER NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('passed', 'failed')),
      errors_json TEXT,
      warnings_json TEXT,
      stats_json TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (candidate_id) REFERENCES candidate_submissions(id),
      UNIQUE(candidate_id, attempt_no)
    )
  `);

  ensureColumn(db, 'candidate_submissions', 'usage_attempt_id', 'TEXT');

  db.run(`
    CREATE TABLE IF NOT EXISTS review_decisions (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL UNIQUE,
      reviewer_id INTEGER,
      requested_action TEXT NOT NULL CHECK(requested_action IN ('adopt', 'return')),
      result TEXT NOT NULL CHECK(result IN ('adopted', 'returned')),
      comment TEXT,
      adopted_version_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (candidate_id) REFERENCES candidate_submissions(id),
      FOREIGN KEY (reviewer_id) REFERENCES users(id),
      FOREIGN KEY (adopted_version_id) REFERENCES prototype_versions(id)
    )
  `);

  migrateLegacyCandidateReview(db);

  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_builds (
      id TEXT PRIMARY KEY,
      prototype_id TEXT NOT NULL,
      change_id TEXT,
      commit_sha TEXT NOT NULL,
      profile TEXT NOT NULL DEFAULT 'preview',
      status TEXT NOT NULL DEFAULT 'queued',
      artifact_digest TEXT,
      entry_file TEXT,
      routes_digest TEXT,
      gate_results_json TEXT,
      log_excerpt TEXT,
      queued_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id),
      FOREIGN KEY (change_id) REFERENCES prototype_changes(id),
      UNIQUE(prototype_id, commit_sha, profile)
    )
  `);

  // 独立原型修改：不依赖项目任务表，完成静态交付检查后直接形成正式版本。
  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_direct_handoffs (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      prototype_id TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      requirement TEXT NOT NULL,
      version_strategy_type TEXT NOT NULL DEFAULT 'auto',
      version_strategy_value TEXT,
      base_version_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN ('created', 'redeemed', 'expired', 'revoked', 'completed', 'failed')),
      expires_at TEXT NOT NULL,
      redeemed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_direct_changes (
      id TEXT PRIMARY KEY,
      handoff_id TEXT NOT NULL UNIQUE,
      prototype_id TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      requirement TEXT NOT NULL,
      version_strategy_type TEXT NOT NULL DEFAULT 'auto',
      version_strategy_value TEXT,
      chosen_version_type TEXT,
      base_version_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'editing'
        CHECK(status IN ('editing', 'preview_pending', 'invalid', 'completed', 'stale', 'cancelled', 'expired', 'failed')),
      candidate_path TEXT,
      candidate_entry_file TEXT,
      candidate_digest TEXT,
      candidate_size_kb INTEGER,
      validation_status TEXT,
      validation_mode TEXT,
      validation_errors_json TEXT,
      validation_warnings_json TEXT,
      validated_at TEXT,
      preview_validated_at TEXT,
      submitted_at TEXT,
      completed_at TEXT,
      version_id INTEGER,
      usage_attempt_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (handoff_id) REFERENCES prototype_direct_handoffs(id),
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (version_id) REFERENCES prototype_versions(id)
    )
  `);

  ensureColumn(db, 'prototype_direct_changes', 'usage_attempt_id', 'TEXT');

  db.run(`
    CREATE TABLE IF NOT EXISTS project_draft_items (
      project_id TEXT NOT NULL,
      project_prototype_id INTEGER NOT NULL,
      prototype_version_id INTEGER NOT NULL,
      updated_by INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, project_prototype_id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (project_prototype_id) REFERENCES project_prototypes(id),
      FOREIGN KEY (prototype_version_id) REFERENCES prototype_versions(id),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS project_releases (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      manifest_json TEXT NOT NULL,
      manifest_digest TEXT NOT NULL UNIQUE,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      UNIQUE(project_id, version_number)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_version_routes (
      prototype_version_id INTEGER NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('export', 'use')),
      route_key TEXT NOT NULL,
      path TEXT,
      params_json TEXT,
      PRIMARY KEY(prototype_version_id, direction, route_key),
      FOREIGN KEY (prototype_version_id) REFERENCES prototype_versions(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_digest TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received'
        CHECK(status IN ('received', 'processing', 'processed', 'failed')),
      received_at TEXT NOT NULL,
      processed_at TEXT,
      error TEXT,
      PRIMARY KEY(provider, event_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_user_id INTEGER,
      delegated_session_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      result TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_user_id) REFERENCES users(id),
      FOREIGN KEY (delegated_session_id) REFERENCES delegated_sessions(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_prototypes_project ON prototypes(project_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_project_prototypes_active ON project_prototypes(project_id, menu_path, unbound_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_project_nodes_tree ON project_nodes(project_id, parent_id, status, sort_order)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_node_assignments_user ON node_assignments(user_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_project_tasks_node_status ON project_tasks(project_id, node_id, status, updated_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(user_id, acceptance_status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_project_task_handoffs_task ON project_task_handoffs(task_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_candidate_submissions_task_status ON candidate_submissions(task_id, status, submission_no)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_candidate_validations_candidate ON candidate_validations(candidate_id, attempt_no)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_review_decisions_candidate ON review_decisions(candidate_id)`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_project_binding_active_node ON project_prototypes(node_id) WHERE node_id IS NOT NULL AND unbound_at IS NULL`);
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prototypes_repo_identity
    ON prototypes(repo_provider, repo_external_id)
    WHERE repo_external_id IS NOT NULL
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_changes_project_status ON prototype_changes(project_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_changes_prototype_status ON prototype_changes(prototype_id, status, updated_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_direct_changes_prototype_status ON prototype_direct_changes(prototype_id, status, updated_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_direct_handoffs_user_status ON prototype_direct_handoffs(created_by, status, updated_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_builds_change ON prototype_builds(change_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_id, created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_webhook_status ON webhook_events(status, received_at)`);

  db.run(`
    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
    VALUES (?, ?)
  `, [COLLABORATION_SCHEMA_VERSION, now()]);
  db.run(`
    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
    VALUES (?, ?)
  `, [LIGHTWEIGHT_COLLABORATION_SCHEMA_VERSION, now()]);
  db.run(`
    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
    VALUES (?, ?)
  `, [PROJECT_NODE_SCHEMA_VERSION, now()]);
  db.run(`
    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
    VALUES (?, ?)
  `, [PROJECT_TASK_SCHEMA_VERSION, now()]);
  db.run(`
    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
    VALUES (?, ?)
  `, [CANDIDATE_REVIEW_SCHEMA_VERSION, now()]);
}

module.exports = {
  COLLABORATION_SCHEMA_VERSION,
  LIGHTWEIGHT_COLLABORATION_SCHEMA_VERSION,
  PROJECT_NODE_SCHEMA_VERSION,
  PROJECT_TASK_SCHEMA_VERSION,
  CANDIDATE_REVIEW_SCHEMA_VERSION,
  applyCollaborationSchema,
  migrateLegacyCandidateReview,
  getColumns
};
