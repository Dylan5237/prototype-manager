const COLLABORATION_SCHEMA_VERSION = '20260814_collaboration_phase1';

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
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prototypes_repo_identity
    ON prototypes(repo_provider, repo_external_id)
    WHERE repo_external_id IS NOT NULL
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_changes_project_status ON prototype_changes(project_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_builds_change ON prototype_builds(change_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_id, created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_webhook_status ON webhook_events(status, received_at)`);

  db.run(`
    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
    VALUES (?, ?)
  `, [COLLABORATION_SCHEMA_VERSION, now()]);
}

module.exports = {
  COLLABORATION_SCHEMA_VERSION,
  applyCollaborationSchema,
  getColumns
};
