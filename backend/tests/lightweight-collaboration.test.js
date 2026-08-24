const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');

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
const viewer = { id: 3, username: 'viewer', roles: ['viewer'] };

function seed() {
  const timestamp = '2026-08-20T00:00:00.000Z';
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'owner', 'hash', '负责人', '["viewer"]', timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [2, 'editor', 'hash', '编辑者', '["viewer"]', timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [3, 'viewer', 'hash', '查看者', '["viewer"]', timestamp]);
  database.run(`INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['project-1', '测试项目', '', '{"items":[]}', 1, timestamp, timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`,
    ['project-1', 2, 'editor', timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`,
    ['project-1', 3, 'viewer', timestamp]);
  database.run(`INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['prototype-1', '测试原型', '', 'index.html', 1, timestamp, timestamp]);
  database.run(`INSERT INTO project_prototypes (project_id, prototype_id, menu_path, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
    ['project-1', 'prototype-1', 'main/list', 0, timestamp]);
  const repoDir = path.join(reposRoot, 'prototype-1');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'index.html'), '<!doctype html><title>base</title><p>base</p>');
}

function candidateZip(name, html = '<!doctype html><title>candidate</title><p>candidate</p>') {
  const zipPath = path.join(tempRoot, name);
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from(html));
  zip.addFile('README.md', Buffer.from('# candidate'));
  zip.writeZip(zipPath);
  return zipPath;
}

function createReadyChange(actor = editor, title = '增加筛选') {
  const created = service.createChange({
    actor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    title,
    requirement: `${title}并保持现有数据`
  });
  const redeemed = service.redeemHandoff({ actor, handoffCode: created.handoffCode });
  const pending = service.submitCandidate({
    actor,
    projectId: 'project-1',
    changeId: redeemed.change.id,
    zipPath: candidateZip(`${redeemed.change.id}.zip`, `<!doctype html><title>${title}</title><p>${title}</p>`)
  });
  const ready = service.recordPreviewValidation({
    actor,
    projectId: 'project-1',
    changeId: redeemed.change.id,
    status: 'passed',
    durationMs: 1200
  });
  return { created, redeemed, pending, ready };
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

test('one-time handoff creates a preview-pending candidate until browser smoke passes', () => {
  const created = service.createChange({
    actor: editor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    title: '增加筛选',
    requirement: '增加状态筛选'
  });
  assert.match(created.handoffCode, /^FX-/);
  assert.equal(created.change.base_version_number, 0);
  const redeemed = service.redeemHandoff({ actor: editor, handoffCode: created.handoffCode });
  assert.equal(redeemed.change.id, created.change.id);
  assert.throws(
    () => service.redeemHandoff({ actor: editor, handoffCode: created.handoffCode }),
    error => error.code === 'HANDOFF_ALREADY_REDEEMED'
  );

  const pending = service.submitCandidate({
    actor: editor,
    projectId: 'project-1',
    changeId: created.change.id,
    zipPath: candidateZip('candidate.zip')
  });
  assert.equal(pending.status, 'preview_pending');
  assert.equal(pending.validation_status, 'pending');
  const ready = service.recordPreviewValidation({
    actor: editor,
    projectId: 'project-1',
    changeId: created.change.id,
    status: 'passed',
    durationMs: 1200
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.candidate_entry_file, 'index.html');
  assert.equal(ready.candidate_path, ready.id);
  assert.match(ready.preview_path, /^\/preview\/changes\//);
  assert.match(fs.readFileSync(path.join(reposRoot, 'prototype-1', 'index.html'), 'utf8'), /base/);
  assert.deepEqual(
    database.query(`SELECT action FROM audit_events ORDER BY created_at, rowid`).map(row => row.action),
    ['change.created', 'handoff.redeemed', 'candidate.preview_pending', 'candidate.preview_passed']
  );
});

test('task prompt is complete and editing rotates the handoff before redemption', () => {
  const created = service.createChange({
    actor: editor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    title: '原任务标题',
    requirement: '原任务要求'
  });
  assert.match(created.prompt, /redeem_change_handoff/);
  assert.match(created.prompt, /submit_change_candidate/);
  assert.match(created.prompt, /原任务要求/);
  assert.match(created.prompt, new RegExp(created.handoffCode));
  const updated = service.updateChange({
    actor: editor,
    projectId: 'project-1',
    changeId: created.change.id,
    title: '新任务标题',
    requirement: '新任务要求'
  });
  assert.notEqual(updated.handoffCode, created.handoffCode);
  assert.equal(updated.change.title, '新任务标题');
  assert.equal(updated.change.requirement, '新任务要求');
  assert.match(updated.prompt, /新任务要求/);
  assert.match(updated.prompt, new RegExp(updated.handoffCode));
  assert.throws(
    () => service.redeemHandoff({ actor: editor, handoffCode: created.handoffCode }),
    error => error.code === 'HANDOFF_NOT_ACTIVE' || error.code === 'HANDOFF_NOT_FOUND'
  );
  const redeemed = service.redeemHandoff({ actor: editor, handoffCode: updated.handoffCode });
  assert.equal(redeemed.change.requirement, '新任务要求');
  assert.throws(
    () => service.updateChange({ actor: editor, projectId: 'project-1', changeId: created.change.id, requirement: '不应更新' }),
    error => error.code === 'CHANGE_ALREADY_REDEEMED' || error.code === 'CHANGE_NOT_EDITABLE'
  );
});

test('task manager cancellation revokes an unredeemed task without changing the prototype', () => {
  const created = service.createChange({
    actor: editor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    requirement: '准备删除的任务'
  });
  const cancelled = service.cancelChange({ actor: editor, projectId: 'project-1', changeId: created.change.id });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.handoff_status, 'revoked');
  assert.equal(database.queryOne('SELECT status FROM agent_handoffs WHERE id = ?', [created.change.handoff_id]).status, 'revoked');
  assert.throws(
    () => service.redeemHandoff({ actor: editor, handoffCode: created.handoffCode }),
    error => error.code === 'HANDOFF_NOT_ACTIVE'
  );
  assert.match(fs.readFileSync(path.join(reposRoot, 'prototype-1', 'index.html'), 'utf8'), /base/);
});

test('expired handoff is persisted as expired and cannot reveal task context', () => {
  let clockMs = Date.parse('2026-08-20T00:00:00.000Z');
  const expiringService = new LightweightCollaborationService({
    reposRoot,
    candidatesRoot,
    clock: () => new Date(clockMs)
  });
  const created = expiringService.createChange({
    actor: editor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    requirement: '验证任务过期'
  });
  clockMs += 11 * 60 * 1000;
  assert.throws(
    () => expiringService.redeemHandoff({ actor: editor, handoffCode: created.handoffCode }),
    error => error.code === 'HANDOFF_EXPIRED'
  );
  assert.equal(database.queryOne('SELECT status FROM agent_handoffs WHERE id = ?', [created.change.handoff_id]).status, 'expired');
});

test('owner adoption creates a formal version and switches current files', () => {
  const { ready } = createReadyChange();
  const adopted = service.adoptChange({ actor: owner, projectId: 'project-1', changeId: ready.id });
  assert.equal(adopted.change.status, 'adopted');
  assert.equal(adopted.version.version_number, 1);
  assert.equal(adopted.prototype.version, 1);
  assert.match(fs.readFileSync(path.join(reposRoot, 'prototype-1', 'index.html'), 'utf8'), /增加筛选/);
  assert.ok(fs.existsSync(path.join(reposRoot, 'prototype-1', 'versions', 'v1', 'index.html')));
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM audit_events WHERE action = 'change.adopted'`).count, 1);
});

test('project change locks custom SemVer and uses the AI-selected bump type', () => {
  const custom = service.createChange({
    actor: editor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    requirement: '固定版本改动',
    versionStrategy: { type: 'custom', value: '2.0.0' }
  });
  assert.equal(custom.change.version_strategy_type, 'custom');
  assert.equal(custom.change.version_strategy_value, '2.0.0');
  const redeemed = service.redeemHandoff({ actor: editor, handoffCode: custom.handoffCode });
  service.submitCandidate({
    actor: editor,
    projectId: 'project-1',
    changeId: redeemed.change.id,
    zipPath: candidateZip('custom-version.zip')
  });
  service.recordPreviewValidation({ actor: editor, projectId: 'project-1', changeId: redeemed.change.id, status: 'passed' });
  const adopted = service.adoptChange({ actor: owner, projectId: 'project-1', changeId: redeemed.change.id });
  assert.equal(adopted.version.version_label, '2.0.0');
});

test('optimistic adoption marks a competing candidate stale without overwriting the winner', () => {
  const first = createReadyChange(editor, '候选一');
  const second = createReadyChange(editor, '候选二');
  service.adoptChange({ actor: owner, projectId: 'project-1', changeId: first.ready.id });
  assert.throws(
    () => service.adoptChange({ actor: owner, projectId: 'project-1', changeId: second.ready.id }),
    error => error instanceof LightweightCollaborationError && error.code === 'STALE_BASE_VERSION'
  );
  assert.equal(service.getChange({ actor: owner, projectId: 'project-1', changeId: second.ready.id }).status, 'stale');
  assert.match(fs.readFileSync(path.join(reposRoot, 'prototype-1', 'index.html'), 'utf8'), /候选一/);
  assert.equal(database.queryOne(`SELECT MAX(version_number) AS version FROM prototype_versions WHERE prototype_id = 'prototype-1'`).version, 1);
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM audit_events WHERE action = 'change.stale'`).count, 1);
});

test('only project administrators can review and rejecting does not change the prototype', () => {
  const { ready } = createReadyChange();
  assert.throws(
    () => service.adoptChange({ actor: editor, projectId: 'project-1', changeId: ready.id }),
    error => error.code === 'AUTHORIZATION_DENIED'
  );
  assert.throws(
    () => service.createChange({ actor: viewer, projectId: 'project-1', prototypeId: 'prototype-1', requirement: '不允许' }),
    error => error.code === 'AUTHORIZATION_DENIED'
  );
  const rejected = service.rejectChange({ actor: owner, projectId: 'project-1', changeId: ready.id, note: '交互不符合预期' });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.review_note, '交互不符合预期');
  assert.match(fs.readFileSync(path.join(reposRoot, 'prototype-1', 'index.html'), 'utf8'), /base/);
  assert.equal(database.queryOne(`SELECT COUNT(*) AS count FROM audit_events WHERE action = 'change.rejected'`).count, 1);
});

test('candidate without an entry remains editable and removes staging residue', () => {
  const created = service.createChange({
    actor: editor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    requirement: '上传一个无入口候选'
  });
  service.redeemHandoff({ actor: editor, handoffCode: created.handoffCode });
  const invalidPath = path.join(tempRoot, 'invalid.zip');
  const zip = new AdmZip();
  zip.addFile('README.md', Buffer.from('# no entry'));
  zip.writeZip(invalidPath);
  assert.throws(
    () => service.submitCandidate({ actor: editor, projectId: 'project-1', changeId: created.change.id, zipPath: invalidPath }),
    error => error.code === 'CANDIDATE_INVALID'
  );
  assert.equal(service.getChange({ actor: editor, projectId: 'project-1', changeId: created.change.id }).status, 'editing');
  assert.deepEqual(fs.existsSync(candidatesRoot) ? fs.readdirSync(candidatesRoot) : [], []);
});

test('static preview validation marks missing resources invalid before browser smoke', () => {
  const created = service.createChange({
    actor: editor,
    projectId: 'project-1',
    prototypeId: 'prototype-1',
    requirement: '上传引用完整的候选'
  });
  service.redeemHandoff({ actor: editor, handoffCode: created.handoffCode });
  const invalidPath = path.join(tempRoot, 'missing-resource.zip');
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from('<!doctype html><script type="module" src="./assets/app.js"></script>'));
  zip.writeZip(invalidPath);
  assert.throws(
    () => service.submitCandidate({ actor: editor, projectId: 'project-1', changeId: created.change.id, zipPath: invalidPath }),
    error => error.code === 'CANDIDATE_INVALID' && error.details.errors.some(item => item.code === 'MISSING_REFERENCE')
  );
  const invalid = service.getChange({ actor: editor, projectId: 'project-1', changeId: created.change.id });
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.validation_status, 'failed');
  assert.equal(invalid.validation_mode, 'static');
});
