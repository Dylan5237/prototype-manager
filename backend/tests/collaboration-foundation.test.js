const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const initSqlJs = require('sql.js');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-collaboration-foundation-'));
const dbPath = path.join(tempRoot, 'legacy.db');

async function createLegacyDatabase() {
  const SQL = await initSqlJs();
  const legacy = new SQL.Database();
  legacy.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      menu_config TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT DEFAULT NULL
    );
    CREATE TABLE prototypes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      github_url TEXT,
      entry_file TEXT,
      category_id INTEGER,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      sync_error TEXT,
      deleted_at TEXT DEFAULT NULL
    );
    CREATE TABLE prototype_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prototype_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      entry_file TEXT,
      sync_source TEXT,
      created_by INTEGER,
      size_kb INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL,
      version_label TEXT DEFAULT ''
    );
    CREATE TABLE project_prototypes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      prototype_id TEXT NOT NULL,
      menu_path TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(project_id, prototype_id, menu_path)
    );
    CREATE TABLE project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TEXT NOT NULL,
      UNIQUE(project_id, user_id)
    );
  `);
  const timestamp = '2026-08-01T00:00:00.000Z';
  legacy.run(
    `INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'owner', 'hash', 'Owner', 'admin', timestamp]
  );
  legacy.run(
    `INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['project-legacy', '旧项目', 'must survive', '{"items":[]}', 1, timestamp, timestamp]
  );
  legacy.run(
    `INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['prototype-legacy', '旧原型', 'must survive', 'index.html', 1, timestamp, timestamp]
  );
  legacy.run(
    `INSERT INTO prototype_versions (prototype_id, version_number, entry_file, created_at) VALUES (?, ?, ?, ?)`,
    ['prototype-legacy', 1, 'index.html', timestamp]
  );
  fs.writeFileSync(dbPath, Buffer.from(legacy.export()));
  legacy.close();
}

let database;

test.before(async () => {
  await createLegacyDatabase();
  database = require('../database/db');
  await database.initDatabase({ path: dbPath });
});

test.after(() => {
  if (database) database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('collaboration migration preserves legacy data and adds safe defaults', () => {
  const project = database.queryOne(`SELECT * FROM projects WHERE id = ?`, ['project-legacy']);
  const prototype = database.queryOne(`SELECT * FROM prototypes WHERE id = ?`, ['prototype-legacy']);
  const version = database.queryOne(`SELECT * FROM prototype_versions WHERE prototype_id = ?`, ['prototype-legacy']);

  assert.equal(project.description, 'must survive');
  assert.equal(project.collaboration_mode, 'legacy_checkout');
  assert.equal(project.draft_revision, 0);
  assert.equal(prototype.description, 'must survive');
  assert.equal(prototype.collaboration_status, 'legacy');
  assert.equal(prototype.default_branch, 'main');
  assert.equal(version.source_kind, 'legacy_upload');
  assert.equal(version.version_label, '1.0.0');

  const expectedTables = [
    'agent_handoffs', 'delegated_sessions', 'prototype_changes', 'prototype_builds',
    'project_draft_items', 'project_releases', 'prototype_version_routes',
    'webhook_events', 'audit_events', 'schema_migrations'
  ];
  const tables = new Set(database.query(`SELECT name FROM sqlite_master WHERE type = 'table'`).map(row => row.name));
  expectedTables.forEach(tableName => assert.ok(tables.has(tableName), `missing table ${tableName}`));
});

test('collaboration migration is idempotent', async () => {
  await database.initDatabase({ path: dbPath });
  const rows = database.query(`
    SELECT version FROM schema_migrations
    WHERE version = '20260814_collaboration_phase1'
  `);
  assert.equal(rows.length, 1);
  assert.equal(database.queryOne(`SELECT name FROM projects WHERE id = 'project-legacy'`).name, '旧项目');
});

test('runInTransaction rolls back all writes on failure', () => {
  assert.throws(() => {
    database.runInTransaction(db => {
      db.run(`
        INSERT INTO audit_events
          (id, action, resource_type, resource_id, result, metadata_json, created_at)
        VALUES ('audit-rollback', 'test', 'project', 'project-legacy', 'started', '{}', '2026-08-14T00:00:00.000Z')
      `);
      throw new Error('stop');
    });
  }, /stop/);
  assert.equal(database.queryOne(`SELECT id FROM audit_events WHERE id = 'audit-rollback'`), null);
});

test('enqueueWrite serializes asynchronous domain writes', async () => {
  const order = [];
  await Promise.all([
    database.enqueueWrite(async db => {
      order.push('first:start');
      await new Promise(resolve => setTimeout(resolve, 20));
      db.run(`
        INSERT INTO audit_events
          (id, action, resource_type, resource_id, result, metadata_json, created_at)
        VALUES ('audit-first', 'test', 'project', 'project-legacy', 'ok', '{}', '2026-08-14T00:00:01.000Z')
      `);
      order.push('first:end');
    }),
    database.enqueueWrite(async db => {
      order.push('second:start');
      db.run(`
        INSERT INTO audit_events
          (id, action, resource_type, resource_id, result, metadata_json, created_at)
        VALUES ('audit-second', 'test', 'project', 'project-legacy', 'ok', '{}', '2026-08-14T00:00:02.000Z')
      `);
      order.push('second:end');
    })
  ]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);
  assert.equal(database.query(`SELECT id FROM audit_events WHERE id IN ('audit-first', 'audit-second')`).length, 2);
});

const {
  ACTIONS,
  AuthorizationError,
  AuthorizationService
} = require('../services/authorization');

function createAuthorizationFixture() {
  const projects = new Map([
    ['p1', { id: 'p1', created_by: 10 }],
    ['p2', { id: 'p2', created_by: 20 }]
  ]);
  const members = new Map([
    ['p1:11', { role: 'admin' }],
    ['p1:12', { role: 'member' }],
    ['p1:13', { role: 'editor' }],
    ['p1:14', { role: 'viewer' }]
  ]);
  return new AuthorizationService({
    getProjectById: id => projects.get(id) || null,
    getProjectMember: (projectId, userId) => members.get(`${projectId}:${userId}`) || null
  });
}

test('fixed authorization matrix internalizes project permissions', () => {
  const auth = createAuthorizationFixture();
  const resource = { type: 'project', projectId: 'p1' };

  assert.equal(auth.can({ id: 99, roles: ['admin'] }, ACTIONS.MANAGE_MEMBERS, resource), true);
  assert.equal(auth.can({ id: 10, roles: [] }, ACTIONS.DELETE_PROJECT, resource), true);
  assert.equal(auth.can({ id: 11, roles: [] }, ACTIONS.MERGE_CHANGE, resource), true);
  assert.equal(auth.can({ id: 11, roles: [] }, ACTIONS.DELETE_PROJECT, resource), false);
  assert.equal(auth.can({ id: 12, roles: [] }, ACTIONS.START_CHANGE, resource), true);
  assert.equal(auth.can({ id: 12, roles: [] }, ACTIONS.MERGE_CHANGE, resource), false);
  assert.equal(auth.can({ id: 13, roles: [] }, ACTIONS.SUBMIT_CHANGE, resource), true);
  assert.equal(auth.can({ id: 14, roles: [] }, ACTIONS.VIEW_PROJECT, resource), true);
  assert.equal(auth.can({ id: 14, roles: [] }, ACTIONS.START_CHANGE, resource), false);
  assert.equal(auth.can({ id: 88, roles: [] }, ACTIONS.VIEW_PROJECT, resource), false);
});

test('agent permission is the intersection of user permission and delegated scope', () => {
  const auth = createAuthorizationFixture();
  const agent = {
    type: 'agent',
    user: { id: 12, roles: [] },
    delegation: {
      projectId: 'p1',
      prototypeId: 'prototype-1',
      scopes: ['source:read', 'change:submit']
    }
  };
  const ownPrototype = { type: 'prototype', projectId: 'p1', prototypeId: 'prototype-1' };
  const otherPrototype = { type: 'prototype', projectId: 'p1', prototypeId: 'prototype-2' };

  assert.equal(auth.can(agent, ACTIONS.READ_SOURCE, ownPrototype), true);
  assert.equal(auth.can(agent, ACTIONS.SUBMIT_CHANGE, ownPrototype), true);
  assert.equal(auth.can(agent, ACTIONS.VIEW_CHANGE, ownPrototype), false);
  assert.equal(auth.can(agent, ACTIONS.READ_SOURCE, otherPrototype), false);
  assert.equal(auth.can(agent, ACTIONS.MERGE_CHANGE, ownPrototype), false);
  assert.equal(auth.can(agent, ACTIONS.MANAGE_MEMBERS, ownPrototype), false);
  assert.throws(
    () => auth.assertCan(agent, ACTIONS.RELEASE_PROJECT, ownPrototype),
    error => error instanceof AuthorizationError && error.code === 'AUTHORIZATION_DENIED'
  );
});
