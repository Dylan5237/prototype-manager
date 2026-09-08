const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  LightweightCollaborationError,
  LightweightCollaborationService
} = require('../services/lightweight-collaboration');

let tempRoot;
let reposRoot;
let candidatesRoot;
let service;
const owner = { id: 1, username: 'owner', roles: ['viewer'] };
const editor = { id: 2, username: 'editor', roles: ['viewer'] };

function seed() {
  const timestamp = '2026-08-20T00:00:00.000Z';
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'owner', 'hash', '负责人', '["viewer"]', timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [2, 'editor', 'hash', '编辑者', '["viewer"]', timestamp]);
  database.run(`INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['project-1', '测试项目', '', '{"items":[]}', 1, timestamp, timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`,
    ['project-1', 2, 'editor', timestamp]);
  database.run(`INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['prototype-1', '测试原型', '', 'index.html', 1, timestamp, timestamp]);
  database.run(`INSERT INTO project_prototypes (project_id, prototype_id, menu_path, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
    ['project-1', 'prototype-1', 'main/list', 0, timestamp]);
  database.run(`INSERT INTO prototype_changes (id, project_id, prototype_id, title, requirement, created_by, branch_name, base_sha, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['legacy-chg-1', 'project-1', 'prototype-1', '历史任务', '只读兼容', 1, 'no-git/legacy-chg-1', 'version:1', 'ready', timestamp, timestamp]);
  const repoDir = path.join(reposRoot, 'prototype-1');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'index.html'), '<!doctype html><title>base</title><p>base</p>');
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-lightweight-collaboration-'));
  reposRoot = path.join(tempRoot, 'repos');
  candidatesRoot = path.join(tempRoot, 'candidates');
  await database.initDatabase({ path: path.join(tempRoot, 'app.db') });
  seed();
  service = new LightweightCollaborationService({ reposRoot, candidatesRoot });
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function assertLegacyWriteForbidden(fn) {
  assert.throws(fn, error => (
    error instanceof LightweightCollaborationError
    && error.code === 'LEGACY_CHANGEID_FORBIDDEN'
    && error.status === 409
    && Array.isArray(error.details.replacement.mcpTools)
    && error.details.replacement.mcpTools.includes('submit_task_candidate')
  ));
}

test('legacy prototype_changes writes are forbidden and point to Task v2', () => {
  assertLegacyWriteForbidden(() => service.createChange({
    actor: editor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    title: '不应创建',
    requirement: '项目绑定必须走 Task v2'
  }));
  assertLegacyWriteForbidden(() => service.updateChange({
    actor: editor, projectId: 'project-1', changeId: 'legacy-chg-1', requirement: '不可改'
  }));
  assertLegacyWriteForbidden(() => service.cancelChange({
    actor: editor, projectId: 'project-1', changeId: 'legacy-chg-1'
  }));
  assertLegacyWriteForbidden(() => service.redeemHandoff({ actor: editor, handoffCode: 'FX-anything' }));
  assertLegacyWriteForbidden(() => service.submitCandidate({
    actor: editor, projectId: 'project-1', changeId: 'legacy-chg-1', zipPath: '/tmp/missing.zip'
  }));
  assertLegacyWriteForbidden(() => service.recordPreviewValidation({
    actor: editor, projectId: 'project-1', changeId: 'legacy-chg-1', status: 'passed'
  }));
  assertLegacyWriteForbidden(() => service.rejectChange({
    actor: owner, projectId: 'project-1', changeId: 'legacy-chg-1', note: 'no'
  }));
  assertLegacyWriteForbidden(() => service.adoptChange({
    actor: owner, projectId: 'project-1', changeId: 'legacy-chg-1'
  }));
});

test('legacy prototype_changes remains readable during the compat period', () => {
  const listed = service.listChanges({ actor: owner, projectId: 'project-1' });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'legacy-chg-1');
  const change = service.getChange({ actor: owner, projectId: 'project-1', changeId: 'legacy-chg-1' });
  assert.equal(change.status, 'ready');
  assert.equal(change.prototype_id, 'prototype-1');
});
