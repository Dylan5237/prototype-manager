const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const database = require('../database/db');
const { generateToken } = require('../middleware/auth');
const previewRouter = require('../routes/preview');
const { updateProject, bindPrototype, getProjectNodes } = require('../services/db-projects');
const { ProjectTaskService } = require('../services/project-tasks');
const { CandidateReviewService, DEFAULT_CANDIDATES_ROOT } = require('../services/candidate-review');
const AdmZip = require('adm-zip');

let tempRoot;
let server;
let baseUrl;
let candidateId;
let changeId;
const timestamp = '2026-09-08T12:00:00.000Z';

function tokenFor(user) {
  return generateToken(user);
}

function request(method, route, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, baseUrl);
    const req = http.request(url, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-candidate-preview-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db'), persist: false });
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (1, 'owner', 'hash', '负责人', '["viewer"]', ?)`, [timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (2, 'editor', 'hash', '编辑者', '["viewer"]', ?)`, [timestamp]);
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (3, 'outsider', 'hash', '外人', '["viewer"]', ?)`, [timestamp]);
  database.run(`INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES ('project-1', '项目', '', '{"items":[]}', 1, ?, ?)`, [timestamp, timestamp]);
  database.run(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('project-1', 2, 'editor', ?)`, [timestamp]);
  database.run(`INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at) VALUES ('prototype-1', '原型', '', 'index.html', 1, ?, ?)`, [timestamp, timestamp]);
  updateProject('project-1', { menuConfig: { items: [{ key: 'main', label: '主菜单', children: [{ key: 'list', label: '列表', children: [] }] }] } });
  const binding = bindPrototype({ projectId: 'project-1', prototypeId: 'prototype-1', menuPath: 'main/list' });
  database.run(`INSERT INTO prototype_versions (prototype_id, version_number, version_label, entry_file, created_by, created_at) VALUES ('prototype-1', 1, '1.0.0', 'index.html', 1, ?)`, [timestamp]);
  const node = getProjectNodes('project-1').find(item => item.id === binding.node_id);
  const tasks = new ProjectTaskService({ clock: () => new Date(timestamp) });
  const task = tasks.createTask({
    actor: { id: 1, username: 'owner', roles: ['viewer'] },
    projectId: 'project-1', nodeId: node.id, bindingId: binding.id,
    title: '预览任务', requirement: '提交候选', responsibleUserId: 2
  });
  tasks.acceptTask({ actor: { id: 2, username: 'editor', roles: ['viewer'] }, projectId: 'project-1', taskId: task.id });
  const zipPath = path.join(tempRoot, 'cand.zip');
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from('<!doctype html><title>preview</title><link rel="stylesheet" href="./app.css"><script src="./app.js"></script><p>preview</p>'));
  zip.addFile('app.js', Buffer.from('window.__fuxi = true;'));
  zip.addFile('app.css', Buffer.from('p{color:#333}'));
  zip.writeZip(zipPath);
  const review = new CandidateReviewService({
    candidatesRoot: DEFAULT_CANDIDATES_ROOT,
    reposRoot: path.join(tempRoot, 'repos'),
    clock: () => new Date(timestamp)
  });
  const candidate = review.submitCandidate({
    actor: { id: 2, username: 'editor', roles: ['viewer'] },
    projectId: 'project-1',
    taskId: task.id,
    zipPath
  });
  candidateId = candidate.id;

  changeId = 'legacy-chg-preview';
  const legacyDir = path.join(DEFAULT_CANDIDATES_ROOT, changeId);
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.copyFileSync(path.join(DEFAULT_CANDIDATES_ROOT, candidate.task_id, candidate.id, 'index.html'), path.join(legacyDir, 'index.html'));
  fs.copyFileSync(path.join(DEFAULT_CANDIDATES_ROOT, candidate.task_id, candidate.id, 'app.js'), path.join(legacyDir, 'app.js'));
  database.run(`INSERT INTO prototype_changes (id, project_id, prototype_id, title, requirement, created_by, branch_name, base_sha, status, candidate_path, candidate_entry_file, created_at, updated_at) VALUES (?, 'project-1', 'prototype-1', '旧候选', '要求', 1, ?, 'version:1', 'ready', ?, 'index.html', ?, ?)`, [changeId, `no-git/${changeId}`, changeId, timestamp, timestamp]);

  const app = express();
  app.use('/preview', previewRouter);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterEach(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (candidateId) {
    const { getCandidateById } = require('../services/candidate-review');
    const candidate = getCandidateById(candidateId);
    if (candidate && candidate.task_id) {
      fs.rmSync(path.join(DEFAULT_CANDIDATES_ROOT, candidate.task_id), { recursive: true, force: true });
    }
  }
  if (changeId) fs.rmSync(path.join(DEFAULT_CANDIDATES_ROOT, changeId), { recursive: true, force: true });
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('candidate preview requires auth for HTML, JS and CSS-equivalent assets', async () => {
  const ownerToken = tokenFor({ id: 1, username: 'owner', role: ['viewer'] });
  const outsiderToken = tokenFor({ id: 3, username: 'outsider', role: ['viewer'] });
  const htmlPath = `/preview/candidates/${encodeURIComponent(candidateId)}/index.html`;
  const jsPath = `/preview/candidates/${encodeURIComponent(candidateId)}/app.js`;
  const cssPath = `/preview/candidates/${encodeURIComponent(candidateId)}/app.css`;

  assert.equal((await request('GET', htmlPath)).status, 401);
  assert.equal((await request('GET', jsPath)).status, 401);
  assert.equal((await request('GET', cssPath)).status, 401);
  assert.equal((await request('GET', htmlPath, outsiderToken)).status, 403);
  assert.equal((await request('GET', jsPath, outsiderToken)).status, 403);
  assert.equal((await request('GET', cssPath, outsiderToken)).status, 403);

  const html = await request('GET', htmlPath, ownerToken);
  assert.equal(html.status, 200);
  assert.match(html.body, /preview/);
  const js = await request('GET', jsPath, ownerToken);
  assert.equal(js.status, 200);
  assert.match(js.body, /window\.__fuxi/);
  const css = await request('GET', cssPath, ownerToken);
  assert.equal(css.status, 200);
  assert.match(css.body, /color/);
});

test('legacy change preview static assets require the same auth as HTML', async () => {
  const ownerToken = tokenFor({ id: 1, username: 'owner', role: ['viewer'] });
  const outsiderToken = tokenFor({ id: 3, username: 'outsider', role: ['viewer'] });
  const htmlPath = `/preview/changes/${encodeURIComponent(changeId)}/index.html`;
  const jsPath = `/preview/changes/${encodeURIComponent(changeId)}/app.js`;
  assert.equal((await request('GET', htmlPath)).status, 401);
  assert.equal((await request('GET', jsPath)).status, 401);
  assert.equal((await request('GET', htmlPath, outsiderToken)).status, 403);
  assert.equal((await request('GET', jsPath, outsiderToken)).status, 403);
  assert.equal((await request('GET', htmlPath, ownerToken)).status, 200);
  assert.equal((await request('GET', jsPath, ownerToken)).status, 200);
});
