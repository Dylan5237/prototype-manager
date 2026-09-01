const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  bindPrototype,
  getProjects,
  getPrototypeProjectBinding,
  PrototypeProjectConflictError
} = require('../services/db-projects');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-project-binding-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db') });
  const timestamp = '2026-08-24T00:00:00.000Z';
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'owner', 'hash', '负责人', '["admin"]', timestamp]);
  database.run(`INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['project-1', '项目一', '', '{"items":[]}', 1, timestamp, timestamp]);
  database.run(`INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['project-2', '项目二', '', '{"items":[]}', 1, timestamp, timestamp]);
  database.run(`INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['prototype-1', '原型一', '', 'index.html', 1, timestamp, timestamp]);
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('allows multiple menu positions in one project but rejects cross-project ownership', () => {
  bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'main/list' });
  bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'reports/list' });
  const binding = getPrototypeProjectBinding('prototype-1');
  assert.equal(binding.project_id, 'project-1');
  assert.deepEqual(binding.menu_positions.map(item => item.menu_path), ['main/list', 'reports/list']);

  assert.throws(
    () => bindPrototype({ projectId: 'project-2', prototypeId: 'prototype-1', menuPath: 'home' }),
    error => error instanceof PrototypeProjectConflictError
      && error.code === 'PROTOTYPE_ALREADY_BOUND'
      && error.details.existingProjectId === 'project-1'
  );
});

test('returns project summary fields for the project list', () => {
  bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'main/list' });
  database.run(`
    INSERT INTO prototype_changes
      (id, project_id, prototype_id, title, requirement, created_by, branch_name, base_sha, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'change-ready', 'project-1', 'prototype-1', '待确认改动', '补充字段', 1,
    'no-git/change-ready', 'base-sha', 'ready', '2026-08-24T01:00:00.000Z', '2026-08-24T02:00:00.000Z'
  ]);
  database.run(`
    INSERT INTO usage_events
      (id, event_type, user_id, source, resource_type, resource_id, result, occurred_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'event-project-1', 'project_opened', 1, 'web', 'project', 'project-1',
    'success', '2026-08-24T03:00:00.000Z', '{}'
  ]);

  const project = getProjects().find(item => item.id === 'project-1');
  assert.equal(project.prototype_count, 1);
  assert.equal(project.pending_candidate_count, 1);
  assert.equal(project.last_activity_at, '2026-08-24T03:00:00.000Z');
});
