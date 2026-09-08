const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  bindPrototype,
  getProjects,
  getProjectsPage,
  getPrototypeProjectBinding,
  getProjectById,
  getProjectNodes,
  getProjectPrototypes,
  getProjectPrototypeById,
  getNodeAssignments,
  removeProjectPrototype,
  removeProjectMember,
  setNodeAssignments,
  updateProject,
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
  updateProject('project-1', { menuConfig: { items: [
    { key: 'main', label: '主菜单', children: [{ key: 'list', label: '列表', children: [] }] },
    { key: 'reports', label: '报表', children: [{ key: 'list', label: '列表', children: [] }] },
    { key: 'design', label: '建模设计', children: [{ key: 'domain', label: '业务域建模', children: [{ key: 'entity', label: '实体建模', children: [] }] }] }
  ] } });
  updateProject('project-2', { menuConfig: { items: [{ key: 'home', label: '首页', children: [] }] } });
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

test('updates a three-level menu and migrates an existing binding atomically', () => {
  updateProject('project-1', { menuConfig: { items: [{ key: 'design', label: '建模设计', children: [{ key: 'domain', label: '业务域建模', children: [] }] }] } });
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain' });
  updateProject('project-1', {
    menuConfig: { items: [{ key: 'design', label: '建模设计', children: [{ key: 'domain', label: '业务域建模', children: [{ key: 'entity', label: '实体建模', children: [] }] }] }] },
    bindingMigrations: [{ bindingId: binding.id, fromPath: 'design/domain', toPath: 'design/domain/entity' }]
  });
  assert.equal(getPrototypeProjectBinding('prototype-1').menu_positions[0].menu_path, 'design/domain/entity');
  assert.equal(getProjectById('project-1').menu_config.items[0].children[0].children[0].label, '实体建模');
});

test('rolls back menu changes when a binding migration is stale', () => {
  updateProject('project-1', { menuConfig: { items: [{ key: 'design', label: '建模设计', children: [{ key: 'domain', label: '业务域建模', children: [] }] }] } });
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain' });
  assert.throws(() => updateProject('project-1', {
    menuConfig: { items: [{ key: 'changed', label: '不应保存', children: [] }] },
    bindingMigrations: [{ bindingId: binding.id, fromPath: 'wrong/path', toPath: 'changed' }]
  }), /原型绑定已发生变化/);
  assert.equal(getProjectById('project-1').menu_config.items[0].children[0].label, '业务域建模');
});

test('keeps stable node identity across rename and rejects binding to a group node', () => {
  const menu = getProjectById('project-1').menu_config;
  const entity = menu.items[2].children[0].children[0];
  entity.label = '实体模型设计';
  updateProject('project-1', { menuConfig: menu });
  const after = getProjectById('project-1').menu_config.items[2].children[0].children[0];
  assert.equal(after.id, entity.id);
  assert.equal(getProjectNodes('project-1').find(node => node.id === entity.id).label, '实体模型设计');
  assert.throws(() => bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain' }), /叶子工作节点/);
});

test('assigns a real node owner and blocks removing an assigned member', () => {
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [2, 'editor', 'hash', '节点负责人', '["uploader"]', '2026-08-24T00:00:00.000Z']);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`, ['project-1', 2, 'editor', '2026-08-24T00:00:00.000Z']);
  const node = getProjectNodes('project-1').find(item => item.node_key === 'entity');
  setNodeAssignments({ projectId: 'project-1', nodeId: node.id, ownerId: 2, contributorIds: [1], assignedBy: 1 });
  const assignments = getNodeAssignments(node.id);
  assert.equal(assignments.find(item => item.assignment_role === 'owner').user_id, 2);
  assert.throws(() => removeProjectMember('project-1', 2), error => error.code === 'MEMBER_HAS_NODE_ASSIGNMENTS');
});

test('unbind preserves history and allows the same binding to be restored', () => {
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain/entity' });
  removeProjectPrototype(binding.id, { projectId: 'project-1', userId: 1 });
  assert.equal(getProjectPrototypes('project-1').length, 0);
  assert.ok(getProjectPrototypeById(binding.id).unbound_at);
  const restored = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain/entity' });
  assert.equal(restored.id, binding.id);
  assert.equal(restored.unbound_at, null);
});

test('unbind is blocked by active checkout or unfinished changes', () => {
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain/entity' });
  database.run(`INSERT INTO project_checkouts (project_id, project_prototype_id, user_id, checked_out_at, expires_at, status) VALUES (?, ?, ?, ?, ?, 'active')`, ['project-1', binding.id, 1, '2026-09-07T00:00:00.000Z', '2099-09-07T00:00:00.000Z']);
  assert.throws(() => removeProjectPrototype(binding.id, { projectId: 'project-1', userId: 1 }), error => error.code === 'BINDING_HAS_ACTIVE_CHECKOUT');
  database.run(`UPDATE project_checkouts SET status = 'released' WHERE project_prototype_id = ?`, [binding.id]);
  database.run(`INSERT INTO prototype_changes (id, project_id, prototype_id, title, requirement, created_by, branch_name, base_sha, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ['change-active', 'project-1', 'prototype-1', '未完成任务', '要求', 1, 'no-git/change-active', 'version:0', 'editing', '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z']);
  assert.throws(() => removeProjectPrototype(binding.id, { projectId: 'project-1', userId: 1 }), error => error.code === 'BINDING_HAS_ACTIVE_CHANGES');
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

test('supports project list scope, pending filter, and pagination', () => {
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [2, 'member', 'hash', '参与者', '["uploader"]', '2026-08-24T00:00:00.000Z']);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`,
    ['project-2', 2, 'editor', '2026-08-24T00:00:00.000Z']);
  database.run(`
    INSERT INTO prototype_changes
      (id, project_id, prototype_id, title, requirement, created_by, branch_name, base_sha, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'pending-project-1', 'project-1', 'prototype-1', '待确认', '需求', 1,
    'no-git/pending-project-1', 'base-sha', 'ready', '2026-08-24T01:00:00.000Z', '2026-08-24T01:00:00.000Z'
  ]);

  const paged = getProjectsPage({ createdBy: 1, page: 2, pageSize: 1 });
  assert.equal(paged.total, 2);
  assert.equal(paged.list.length, 1);
  assert.equal(paged.page, 2);

  const participating = getProjectsPage({ memberOf: 2, page: 1, pageSize: 12 });
  assert.equal(participating.total, 1);
  assert.equal(participating.list[0].id, 'project-2');
  assert.equal(participating.list[0].member_count, 2);

  const pending = getProjectsPage({ pendingOnly: true, page: 1, pageSize: 12 });
  assert.equal(pending.total, 1);
  assert.equal(pending.list[0].id, 'project-1');
});
