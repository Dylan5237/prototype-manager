const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');

const database = require('../database/db');
const { migrateLegacyCandidateReview } = require('../database/collaboration-schema');
const { updateProject, bindPrototype, getProjectNodes, removeProjectPrototype, removeProjectMember } = require('../services/db-projects');
const { ProjectTaskService } = require('../services/project-tasks');
const { CandidateReviewError, CandidateReviewService } = require('../services/candidate-review');
const { AuthorizationError } = require('../services/authorization');

let tempRoot;
let reposRoot;
let candidatesRoot;
let service;
let tasks;
const timestamp = '2026-09-08T12:00:00.000Z';
const owner = { id: 1, username: 'owner', roles: ['viewer'] };
const editor = { id: 2, username: 'editor', roles: ['viewer'] };
const viewer = { id: 3, username: 'viewer', roles: ['viewer'] };
const projectAdmin = { id: 4, username: 'project-admin', roles: ['viewer'] };

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-candidate-review-'));
  reposRoot = path.join(tempRoot, 'repos');
  candidatesRoot = path.join(tempRoot, 'candidates');
  await database.initDatabase({ path: path.join(tempRoot, 'app.db') });
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (1, 'owner', 'hash', '负责人', '["viewer"]', ?)`, [timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (2, 'editor', 'hash', '编辑者', '["viewer"]', ?)`, [timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (3, 'viewer', 'hash', '查看者', '["viewer"]', ?)`, [timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (4, 'project-admin', 'hash', '项目管理员', '["viewer"]', ?)`, [timestamp]);
  database.run(`INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES ('project-1', '建模开发平台', '', '{"items":[]}', 1, ?, ?)`, [timestamp, timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('project-1', 2, 'editor', ?)`, [timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('project-1', 3, 'viewer', ?)`, [timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('project-1', 4, 'admin', ?)`, [timestamp]);
  database.run(`INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at) VALUES ('prototype-1', '实体建模', '', 'index.html', 1, ?, ?)`, [timestamp, timestamp]);
  updateProject('project-1', { menuConfig: { items: [
    { key: 'design', label: '建模设计', children: [{ key: 'domain', label: '业务域建模', children: [{ key: 'entity', label: '实体建模', children: [] }] }] },
    { key: 'reports', label: '报表', children: [{ key: 'list', label: '列表', children: [] }] }
  ] } });
  service = new CandidateReviewService({ reposRoot, candidatesRoot, clock: () => new Date(timestamp) });
  tasks = new ProjectTaskService({ clock: () => new Date(timestamp) });
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function setupBinding(menuPath = 'design/domain/entity') {
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath });
  database.run(`INSERT INTO prototype_versions (prototype_id, version_number, version_label, entry_file, created_by, created_at) VALUES ('prototype-1', 1, '1.0.0', 'index.html', 1, ?)`, [timestamp]);
  const node = getProjectNodes('project-1').find(item => item.id === binding.node_id);
  const repoDir = path.join(reposRoot, 'prototype-1');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'index.html'), '<!doctype html><title>base</title><p>base</p>');
  return { binding, node };
}

function zipFile(name, files) {
  const zipPath = path.join(tempRoot, name);
  const zip = new AdmZip();
  Object.entries(files).forEach(([file, content]) => zip.addFile(file, Buffer.from(content)));
  zip.writeZip(zipPath);
  return zipPath;
}

function validZip(name, title = 'candidate') {
  return zipFile(name, { 'index.html': `<!doctype html><title>${title}</title><p>${title}</p>`, 'README.md': '# ok' });
}

function createAcceptedTask({ actor = owner, responsibleUserId = 2, title = '补充字段' } = {}) {
  const { binding, node } = setupBinding();
  const task = tasks.createTask({
    actor, projectId: 'project-1', nodeId: node.id, bindingId: binding.id,
    title, requirement: `${title}并保持现有数据`, responsibleUserId
  });
  const accepted = tasks.acceptTask({ actor: editor, projectId: 'project-1', taskId: task.id });
  return { binding, node, task: accepted.task, handoffCode: accepted.handoffCode };
}

test('legacy unique binding migrates idempotently including v0 and missing artifacts', () => {
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain/entity' });
  database.run(`INSERT INTO prototype_changes (id, project_id, prototype_id, title, requirement, created_by, branch_name, base_sha, base_version_number, status, candidate_path, candidate_entry_file, validation_status, validation_mode, created_at, updated_at) VALUES ('chg-v0', 'project-1', 'prototype-1', '零版本任务', '要求', 1, 'no-git/chg-v0', 'version:0', 0, 'ready', 'chg-v0', 'index.html', 'passed', 'static', ?, ?)`, [timestamp, timestamp]);
  migrateLegacyCandidateReview(database.getDb());
  const first = database.queryOne(`SELECT * FROM project_tasks WHERE id = 'legacy_task_chg-v0'`);
  assert.equal(first.binding_id, binding.id);
  assert.equal(first.base_version_number, 0);
  assert.equal(database.queryOne(`SELECT status FROM candidate_submissions WHERE id = 'legacy_candidate_chg-v0'`).status, 'ready');
  migrateLegacyCandidateReview(database.getDb());
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM project_tasks WHERE id = 'legacy_task_chg-v0'`).count, 1);
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM candidate_submissions WHERE source_change_id = 'chg-v0'`).count, 1);
  assert.throws(
    () => service.adoptCandidate({ actor: owner, projectId: 'project-1', candidateId: 'legacy_candidate_chg-v0' }),
    error => error.code === 'CANDIDATE_FILE_MISSING'
  );
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM prototype_versions WHERE prototype_id = 'prototype-1'`).count, 1);
});

test('legacy multi-binding rows stay unresolved without inventing binding_id', () => {
  bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'design/domain/entity' });
  bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'reports/list' });
  database.run(`INSERT INTO prototype_changes (id, project_id, prototype_id, title, requirement, created_by, branch_name, base_sha, status, created_at, updated_at) VALUES ('chg-multi', 'project-1', 'prototype-1', '多绑定历史', '要求', 1, 'no-git/chg-multi', 'version:1', 'ready', ?, ?)`, [timestamp, timestamp]);
  migrateLegacyCandidateReview(database.getDb());
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM project_tasks WHERE id = 'legacy_task_chg-multi'`).count, 0);
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM candidate_submissions WHERE id = 'legacy_candidate_chg-multi'`).count, 0);
  assert.equal(database.queryOne(`SELECT binding_id FROM prototype_changes WHERE id = 'chg-multi'`).binding_id, null);
});

test('fail, success, return and resubmit keep four independent records and directories', () => {
  const { task } = createAcceptedTask();
  const failedZip = zipFile('fail.zip', { 'README.md': '# no entry' });
  assert.throws(
    () => service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: task.id, zipPath: failedZip }),
    error => error.code === 'CANDIDATE_INVALID'
  );
  const ready = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: task.id, zipPath: validZip('ok.zip', '第一版') });
  assert.equal(ready.status, 'ready');
  const returned = service.returnCandidate({ actor: owner, projectId: 'project-1', candidateId: ready.id, note: '再改一版' });
  assert.equal(returned.status, 'returned');
  assert.equal(returned.decision.reviewer_id, 1);
  assert.equal(returned.decision.reviewer_name, '负责人');
  assert.equal(returned.decision.reviewer_username, 'owner');
  const resubmitted = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: task.id, zipPath: validZip('ok2.zip', '第二版') });
  const listed = service.listCandidates({ actor: owner, projectId: 'project-1', taskId: task.id });
  assert.equal(listed.length, 3);
  assert.deepEqual(listed.map(item => item.status), ['validation_failed', 'returned', 'ready']);
  assert.equal(new Set(listed.map(item => item.id)).size, 3);
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM review_decisions WHERE candidate_id = ?`, [ready.id]).count, 1);
  const dirs = fs.readdirSync(path.join(candidatesRoot, task.id));
  assert.equal(dirs.length, 3);
  listed.forEach(item => {
    assert.ok(fs.existsSync(path.join(candidatesRoot, task.id, item.id)));
  });
  assert.equal(resubmitted.submission_no, 3);
});

test('browser validation is append-only and cannot forge a server pass', () => {
  const { task } = createAcceptedTask();
  assert.throws(
    () => service.submitCandidate({
      actor: editor, projectId: 'project-1', taskId: task.id,
      zipPath: zipFile('missing.zip', { 'index.html': '<!doctype html><script src="./missing.js"></script>' })
    }),
    error => error.code === 'CANDIDATE_INVALID'
  );
  const failed = service.listCandidates({ actor: owner, projectId: 'project-1', taskId: task.id })[0];
  assert.equal(failed.status, 'validation_failed');
  const forged = service.recordPreviewValidation({
    actor: editor, projectId: 'project-1', candidateId: failed.id, status: 'passed'
  });
  assert.equal(forged.status, 'validation_failed');
  assert.equal(forged.validations.length, 2);
  assert.equal(forged.validations[1].source, 'client');
  assert.equal(forged.validations[1].status, 'passed');
  const ready = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: task.id, zipPath: validZip('ok.zip') });
  const recorded = service.recordPreviewValidation({
    actor: editor, projectId: 'project-1', candidateId: ready.id, status: 'failed', errors: ['runtime']
  });
  assert.equal(recorded.status, 'ready');
  assert.equal(recorded.validations.length, 2);
});

test('a new ready candidate replaces the previous pending ready on the same task', () => {
  const { task } = createAcceptedTask();
  const first = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: task.id, zipPath: validZip('first.zip', '第一待审') });
  assert.equal(first.status, 'ready');
  const second = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: task.id, zipPath: validZip('second.zip', '第二待审') });
  assert.equal(second.status, 'ready');
  assert.equal(service.getCandidate({ actor: owner, projectId: 'project-1', candidateId: first.id }).status, 'stale');
  const listed = service.listCandidates({ actor: owner, projectId: 'project-1', taskId: task.id });
  assert.equal(listed.filter(item => item.status === 'ready').length, 1);
  assert.equal(listed.find(item => item.status === 'ready').id, second.id);
  assert.equal(listed.find(item => item.status === 'ready').candidateId, second.id);
  assert.equal(listed.find(item => item.status === 'ready').taskId, task.id);
});

test('adopt creates version and decision, stales competitors, and rejects double adopt', () => {
  const first = createAcceptedTask({ title: '候选一' });
  const readyA = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: first.task.id, zipPath: validZip('a.zip', '候选一') });
  const secondTask = tasks.createTask({
    actor: owner, projectId: 'project-1', nodeId: first.node.id, bindingId: first.binding.id,
    title: '候选二', requirement: '第二候选', responsibleUserId: 2
  });
  tasks.acceptTask({ actor: editor, projectId: 'project-1', taskId: secondTask.id });
  const readyB = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: secondTask.id, zipPath: validZip('b.zip', '候选二') });
  const adopted = service.adoptCandidate({ actor: owner, projectId: 'project-1', candidateId: readyA.id });
  assert.equal(adopted.candidate.status, 'adopted');
  assert.equal(adopted.version.version_number, 2);
  assert.ok(adopted.candidate.decision.adopted_version_id);
  assert.match(fs.readFileSync(path.join(reposRoot, 'prototype-1', 'index.html'), 'utf8'), /候选一/);
  assert.equal(service.getCandidate({ actor: owner, projectId: 'project-1', candidateId: readyB.id }).status, 'stale');
  assert.throws(
    () => service.adoptCandidate({ actor: owner, projectId: 'project-1', candidateId: readyA.id }),
    error => error.code === 'CANDIDATE_NOT_REVIEWABLE'
  );
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM prototype_versions WHERE prototype_id = 'prototype-1'`).count, 2);
});

test('roles and initiator mismatch are enforced for submit and review', () => {
  const { task } = createAcceptedTask();
  const zipPath = validZip('role.zip');
  assert.throws(
    () => service.submitCandidate({ actor: viewer, projectId: 'project-1', taskId: task.id, zipPath }),
    error => error instanceof AuthorizationError || error.code === 'CANDIDATE_SUBMIT_FORBIDDEN'
  );
  assert.throws(
    () => service.submitCandidate({ actor: owner, projectId: 'project-1', taskId: task.id, zipPath }),
    error => error.code === 'CANDIDATE_SUBMIT_FORBIDDEN'
  );
  const ready = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: task.id, zipPath });
  assert.throws(
    () => tasks.cancelTask({ actor: owner, projectId: 'project-1', taskId: task.id }),
    error => error.code === 'TASK_HAS_PENDING_REVIEW'
  );
  assert.throws(
    () => service.adoptCandidate({ actor: editor, projectId: 'project-1', candidateId: ready.id }),
    error => error instanceof AuthorizationError
  );
  assert.throws(
    () => service.returnCandidate({ actor: viewer, projectId: 'project-1', candidateId: ready.id, note: 'no' }),
    error => error instanceof AuthorizationError
  );
  assert.equal(service.returnCandidate({ actor: projectAdmin, projectId: 'project-1', candidateId: ready.id, note: '管理员退回' }).status, 'returned');
  const again = service.submitCandidate({ actor: editor, projectId: 'project-1', taskId: task.id, zipPath: validZip('again.zip') });
  assert.throws(
    () => tasks.cancelTask({ actor: owner, projectId: 'project-1', taskId: task.id }),
    error => error.code === 'TASK_HAS_PENDING_REVIEW'
  );
  service.returnCandidate({ actor: owner, projectId: 'project-1', candidateId: again.id, note: '结束' });
  assert.equal(tasks.cancelTask({ actor: owner, projectId: 'project-1', taskId: task.id }).status, 'cancelled');
});

test('unbind, node disable and member remove only see that binding open work', () => {
  const { binding, node, task } = createAcceptedTask();
  const other = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'reports/list' });
  removeProjectPrototype(other.id, { projectId: 'project-1', userId: 1 });
  assert.ok(database.queryOne(`SELECT unbound_at FROM project_prototypes WHERE id = ?`, [other.id]).unbound_at);
  assert.throws(() => removeProjectPrototype(binding.id, { projectId: 'project-1', userId: 1 }), error => error.code === 'BINDING_HAS_ACTIVE_CHANGES');
  const menu = {
    items: [
      { key: 'reports', label: '报表', children: [{ key: 'list', label: '列表', children: [] }] }
    ]
  };
  assert.throws(() => updateProject('project-1', { menuConfig: menu }), /未完成任务或待审候选|仍有绑定/);
  assert.throws(() => removeProjectMember('project-1', 2), error => error.code === 'MEMBER_HAS_OPEN_TASKS');
  tasks.cancelTask({ actor: owner, projectId: 'project-1', taskId: task.id });
  removeProjectPrototype(binding.id, { projectId: 'project-1', userId: 1 });
  assert.equal(node.id, task.node_id);
});
