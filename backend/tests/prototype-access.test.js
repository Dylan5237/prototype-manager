const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');

const database = require('../database/db');
const { generateToken } = require('../middleware/auth');
const { router: prototypeRouter } = require('../routes/prototypes');
const previewRouter = require('../routes/preview');

let tempRoot;
let server;
let baseUrl;
const repoRoot = path.join(__dirname, '..', 'repos');
const prototypeIds = ['bl007-private', 'bl007-shared', 'bl007-project', 'bl007-deleted'];

function insertUser(id, username, role) {
  database.run(
    `INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, username, 'test-hash', username, JSON.stringify([role]), '2026-09-01T00:00:00.000Z']
  );
}

function insertPrototype(id, createdBy, deletedAt = null) {
  database.run(
    `INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, id, 'BL-007 access test', 'index.html', createdBy, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', deletedAt]
  );
}

function tokenFor(id, username, role) {
  return generateToken({ id, username, role: [role] });
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
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-bl007-access-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db'), persist: false });

  insertUser(1, 'admin', 'admin');
  insertUser(2, 'owner', 'viewer');
  insertUser(3, 'shared', 'viewer');
  insertUser(4, 'unrelated', 'viewer');
  insertPrototype('bl007-private', 2);
  insertPrototype('bl007-shared', 2);
  insertPrototype('bl007-project', 2);
  insertPrototype('bl007-deleted', 2, '2026-09-01T01:00:00.000Z');
  database.run(
    `INSERT INTO prototype_shares (prototype_id, user_id, created_at) VALUES (?, ?, ?)`,
    ['bl007-shared', 3, '2026-09-01T00:00:00.000Z']
  );
  database.run(
    `INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['bl007-project-container', 'BL-007 project', '', '{"items":[]}', 2, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']
  );
  database.run(
    `INSERT INTO project_prototypes (project_id, prototype_id, menu_path, created_at) VALUES (?, ?, ?, ?)`,
    ['bl007-project-container', 'bl007-project', 'home', '2026-09-01T00:00:00.000Z']
  );
  database.run(
    `INSERT INTO readme_cache (prototype_id, content, file_path, updated_at) VALUES (?, ?, ?, ?)`,
    ['bl007-private', '# Private README', 'README.md', '2026-09-01T00:00:00.000Z']
  );
  database.run(
    `INSERT INTO prototype_versions (prototype_id, version_number, entry_file, created_by, created_at, version_label) VALUES (?, ?, ?, ?, ?, ?)`,
    ['bl007-private', 1, 'index.html', 2, '2026-09-01T00:00:00.000Z', '1.0.0']
  );

  for (const id of prototypeIds) {
    const dir = path.join(repoRoot, id);
    fs.mkdirSync(path.join(dir, 'versions', '1.0.0'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<html><head></head><body>${id}</body></html>`);
    fs.writeFileSync(path.join(dir, 'versions', '1.0.0', 'index.html'), `<html><body>${id}-v1</body></html>`);
  }

  const app = express();
  app.use(express.json());
  app.use('/api/prototypes', prototypeRouter);
  app.use('/preview', previewRouter);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  database.closeDatabase();
  for (const id of prototypeIds) {
    fs.rmSync(path.join(repoRoot, id), { recursive: true, force: true });
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('管理员可发现并只读预览全部有效原型，回收站对象不在范围内', async () => {
  const adminToken = tokenFor(1, 'admin', 'admin');

  const list = await request('GET', '/api/prototypes?scope=all&page=1&pageSize=50', adminToken);
  assert.equal(list.status, 200);
  const listedIds = list.body && JSON.parse(list.body).data.map(item => item.id);
  assert.deepEqual(new Set(listedIds), new Set(['bl007-private', 'bl007-shared', 'bl007-project']));

  const detail = await request('GET', '/api/prototypes/bl007-project', adminToken);
  assert.equal(detail.status, 200);
  assert.equal(JSON.parse(detail.body).data.project_binding.project_id, 'bl007-project-container');

  const readme = await request('GET', '/api/prototypes/bl007-private/readme', adminToken);
  assert.equal(readme.status, 200);
  assert.match(readme.body, /Private README/);

  const content = await request('GET', '/api/prototypes/bl007-private/content/index.html', adminToken);
  assert.equal(content.status, 200);
  assert.match(content.body, /bl007-private/);

  const currentPreview = await request('GET', '/preview/bl007-private/index.html', adminToken);
  assert.equal(currentPreview.status, 200);
  assert.match(currentPreview.body, /bl007-private/);
  assert.match(currentPreview.body, /isBenignResizeObserverError/);
  assert.match(currentPreview.body, /ResizeObserver loop/);

  const historicalPreview = await request('GET', '/preview/bl007-private/versions/1.0.0/index.html', adminToken);
  assert.equal(historicalPreview.status, 200);
  assert.match(historicalPreview.body, /bl007-private-v1/);

  const previewEvents = database.query(
    `SELECT event_type, metadata_json FROM usage_events WHERE resource_type = ? AND resource_id = ?`,
    ['prototype', 'bl007-private']
  );
  assert.ok(previewEvents.some(event => event.event_type === 'prototype_previewed'));
  assert.ok(previewEvents.every(event => !/token/i.test(event.metadata_json)));

  const deletedDetail = await request('GET', '/api/prototypes/bl007-deleted', adminToken);
  assert.equal(deletedDetail.status, 403);
  const deletedPreview = await request('GET', '/preview/bl007-deleted/index.html', adminToken);
  assert.equal(deletedPreview.status, 403);
  const deletedAsset = await request('GET', '/preview/bl007-deleted/app.js');
  assert.equal(deletedAsset.status, 404);
});

test('非管理员仍按所有者或明确分享访问，越权和未认证请求被拒绝', async () => {
  const ownerToken = tokenFor(2, 'owner', 'viewer');
  const sharedToken = tokenFor(3, 'shared', 'viewer');
  const unrelatedToken = tokenFor(4, 'unrelated', 'viewer');

  assert.equal((await request('GET', '/api/prototypes/bl007-private', ownerToken)).status, 200);
  assert.equal((await request('GET', '/api/prototypes/bl007-shared', sharedToken)).status, 200);
  assert.equal((await request('GET', '/preview/bl007-shared/index.html', sharedToken)).status, 200);
  assert.equal((await request('GET', '/api/prototypes/bl007-private', unrelatedToken)).status, 403);
  assert.equal((await request('GET', '/preview/bl007-private/index.html', unrelatedToken)).status, 403);
  assert.equal((await request('GET', '/api/prototypes/bl007-private')).status, 401);
});

test('历史单值 role token 仍可识别管理员预览权限', async () => {
  const legacyToken = jwt.sign(
    { id: 1, username: 'admin', role: 'admin' },
    process.env.JWT_SECRET || 'nvwa-secret-key-change-in-production',
    { expiresIn: '7d' }
  );
  const list = await request('GET', '/api/prototypes?scope=all&page=1&pageSize=50', legacyToken);
  assert.equal(list.status, 200);
  assert.equal(JSON.parse(list.body).data.length, 3);
  assert.equal((await request('GET', '/preview/bl007-private/index.html', legacyToken)).status, 200);
});
