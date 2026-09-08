const crypto = require('crypto');

const COLLABORATION_SCHEMA_VERSION = '20260814_collaboration_phase1';
const LIGHTWEIGHT_COLLABORATION_SCHEMA_VERSION = '20260820_lightweight_collaboration_mvp';
const PROJECT_NODE_SCHEMA_VERSION = '20260907_project_nodes_v1';

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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (handoff_id) REFERENCES prototype_direct_handoffs(id),
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (version_id) REFERENCES prototype_versions(id)
    )
  `);

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
}

module.exports = {
  COLLABORATION_SCHEMA_VERSION,
  LIGHTWEIGHT_COLLABORATION_SCHEMA_VERSION,
  PROJECT_NODE_SCHEMA_VERSION,
  applyCollaborationSchema,
  getColumns
};
