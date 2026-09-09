const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const { updateProject, bindPrototype, getProjectNodes } = require('../services/db-projects');
const { ProjectTaskError, ProjectTaskService } = require('../services/project-tasks');

let tempRoot;
const timestamp = '2026-09-08T08:00:00.000Z';
const owner = { id: 1, username: 'owner', roles: ['admin'] };
const member = { id: 2, username: 'member', roles: ['uploader'] };

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-project-tasks-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db') });
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (1, 'owner', 'hash', '负责人', '["admin"]', ?)`, [timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (2, 'member', 'hash', '执行人', '["uploader"]', ?)`, [timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (3, 'viewer', 'hash', '查看人', '["viewer"]', ?)`, [timestamp]);
  database.run(`INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES ('project-1', '建模开发平台', '', '{"items":[]}', 1, ?, ?)`, [timestamp, timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('project-1', 2, 'editor', ?)`, [timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('project-1', 3, 'viewer', ?)`, [timestamp]);
  database.run(`INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at) VALUES ('prototype-1', '实体建模', '', 'index.html', 1, ?, ?)`, [timestamp, timestamp]);
  updateProject('project-1', { menuConfig: { items: [{ key: 'design', label: '建模设计', children: [{ key: 'domain', label: '业务域建模', children: [{ key: 'entity', label: '实体建模', children: [] }] }] }] } });
});
test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function setupVersionAndBinding() {
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain/entity' });
  database.run(`INSERT INTO prototype_versions (prototype_id, version_number, version_label, entry_file, created_by, created_at) VALUES ('prototype-1', 1, '1.0.0', 'index.html', 1, ?)`, [timestamp]);
  const node = getProjectNodes('project-1').find(item => item.node_key === 'entity');
  return { binding, node };
}

test('creates a task against an exact work node, binding and formal base version', () => {
  const { binding, node } = setupVersionAndBinding();
  const service = new ProjectTaskService({ clock: () => new Date(timestamp) });
  const task = service.createTask({ actor: owner, projectId: 'project-1', nodeId: node.id, bindingId: binding.id, title: '补充出入院实体字段', requirement: '补充住院号和出院时间校验', responsibleUserId: 2, participantUserIds: [1] });
  assert.equal(task.status, 'assigned');
  assert.equal(task.base_version_number, 1);
  assert.equal(task.responsible.user_id, 2);
  assert.equal(task.assignments.find(item => item.assignment_role === 'participant').user_id, 1);
  const listed = service.listTasks({ actor: owner, projectId: 'project-1', nodeId: node.id });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].candidate_count, 0);
  assert.equal(listed[0].pending_candidate_count, 0);
});

test('rejects tasks without a formal base version and invalid participants', () => {
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain/entity' });
  const node = getProjectNodes('project-1').find(item => item.node_key === 'entity');
  const service = new ProjectTaskService();
  assert.throws(() => service.createTask({ actor: owner, projectId: 'project-1', nodeId: node.id, bindingId: binding.id, title: '任务', requirement: '要求', responsibleUserId: 2 }), error => error.code === 'BASE_VERSION_MISSING');
  database.run(`INSERT INTO prototype_versions (prototype_id, version_number, version_label, entry_file, created_by, created_at) VALUES ('prototype-1', 1, '1.0.0', 'index.html', 1, ?)`, [timestamp]);
  assert.throws(() => service.createTask({ actor: owner, projectId: 'project-1', nodeId: node.id, bindingId: binding.id, title: '任务', requirement: '要求', responsibleUserId: 2, participantUserIds: [3] }), error => error.code === 'TASK_PARTICIPANT_INVALID');
});

test('responsible member accepts or declines while owner can reassign and cancel', () => {
  const { binding, node } = setupVersionAndBinding();
  const service = new ProjectTaskService({ clock: () => new Date(timestamp) });
  const first = service.createTask({ actor: owner, projectId: 'project-1', nodeId: node.id, bindingId: binding.id, title: '实体任务', requirement: '要求', responsibleUserId: 2 });
  assert.throws(() => service.acceptTask({ actor: owner, projectId: 'project-1', taskId: first.id }), error => error.code === 'TASK_ACCEPT_FORBIDDEN');
  const accepted = service.acceptTask({ actor: member, projectId: 'project-1', taskId: first.id });
  assert.match(accepted.handoffCode, /^FXT-/);
  assert.equal(accepted.task.status, 'in_progress');
  const reassigned = service.reassignTask({ actor: owner, projectId: 'project-1', taskId: first.id, responsibleUserId: 1 });
  assert.equal(reassigned.status, 'assigned');
  assert.equal(reassigned.responsible.user_id, 1);
  assert.equal(service.cancelTask({ actor: owner, projectId: 'project-1', taskId: first.id }).status, 'cancelled');

  const second = service.createTask({ actor: owner, projectId: 'project-1', nodeId: node.id, bindingId: binding.id, title: '接口任务', requirement: '要求', responsibleUserId: 2 });
  const declined = service.declineTask({ actor: member, projectId: 'project-1', taskId: second.id });
  assert.equal(declined.responsible, null);
  assert.equal(declined.assignments.at(-1).acceptance_status, 'declined');
});

test('legacy collaboration rows stay separate from task v2', () => {
  const { binding, node } = setupVersionAndBinding();
  database.run(`INSERT INTO prototype_changes (id, project_id, prototype_id, title, requirement, created_by, branch_name, base_sha, status, created_at, updated_at) VALUES ('legacy-change', 'project-1', 'prototype-1', '旧任务', '旧要求', 1, 'no-git/legacy', 'version:1', 'editing', ?, ?)`, [timestamp, timestamp]);
  const service = new ProjectTaskService();
  assert.equal(service.listTasks({ actor: owner, projectId: 'project-1' }).length, 0);
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM project_tasks`).count, 0);
  const task = service.createTask({ actor: owner, projectId: 'project-1', nodeId: node.id, bindingId: binding.id, title: '新任务', requirement: '新要求', responsibleUserId: 2 });
  assert.notEqual(task.id, 'legacy-change');
});
