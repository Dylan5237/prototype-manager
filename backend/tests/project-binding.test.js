const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  bindPrototype,
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
