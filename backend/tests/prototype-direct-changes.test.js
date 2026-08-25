const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');

const database = require('../database/db');
const {
  PrototypeDirectChangeError,
  PrototypeDirectChangeService
} = require('../services/prototype-direct-changes');

let tempRoot;
let reposRoot;
let candidatesRoot;
let service;
const owner = { id: 1, username: 'owner', roles: ['viewer'] };

function candidateZip(name, html = '<!doctype html><title>candidate</title><p>candidate</p>') {
  const zipPath = path.join(tempRoot, name);
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from(html));
  zip.addFile('README.md', Buffer.from('# candidate'));
  zip.writeZip(zipPath);
  return zipPath;
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-direct-change-'));
  reposRoot = path.join(tempRoot, 'repos');
  candidatesRoot = path.join(tempRoot, 'candidates');
  await database.initDatabase({ path: path.join(tempRoot, 'app.db') });
  const timestamp = '2026-08-24T00:00:00.000Z';
  database.run(`INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'owner', 'hash', '负责人', '["viewer"]', timestamp]);
  database.run(`INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['prototype-1', '独立原型', '', 'index.html', 1, timestamp, timestamp]);
  database.run(`INSERT INTO prototype_versions (prototype_id, version_number, entry_file, sync_source, created_by, size_kb, note, version_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['prototype-1', 1, 'index.html', 'upload', 1, 1, '基线', '1.0.0', timestamp]);
  fs.mkdirSync(path.join(reposRoot, 'prototype-1'), { recursive: true });
  fs.writeFileSync(path.join(reposRoot, 'prototype-1', 'index.html'), '<!doctype html><title>base</title><p>base</p>');
  service = new PrototypeDirectChangeService({ reposRoot, candidatesRoot });
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('direct change is redeemed once and becomes a formal version after static checks', () => {
  const created = service.createChange({
    actor: owner,
    prototypeId: 'prototype-1',
    requirement: '增加一个筛选入口',
    versionStrategy: { type: 'auto' }
  });
  assert.equal(created.change.status, 'editing');
  const redeemed = service.redeemHandoff({ actor: owner, handoffCode: created.handoffCode });
  assert.equal(redeemed.change.handoff_status, 'redeemed');
  assert.throws(
    () => service.redeemHandoff({ actor: owner, handoffCode: created.handoffCode }),
    error => error instanceof PrototypeDirectChangeError && error.code === 'HANDOFF_NOT_ACTIVE'
  );

  const completed = service.submitCandidate({
    actor: owner,
    changeId: created.change.id,
    zipPath: candidateZip('candidate.zip'),
    versionType: 'minor'
  });
  assert.equal(completed.change.status, 'completed');
  assert.equal(completed.change.validation_mode, 'static');
  assert.equal(completed.version.version_label, '1.1.0');
  assert.equal(database.queryOne(`SELECT MAX(version_number) AS number FROM prototype_versions WHERE prototype_id = ?`, ['prototype-1']).number, 2);
  assert.match(fs.readFileSync(path.join(reposRoot, 'prototype-1', 'index.html'), 'utf8'), /candidate/);
});

test('custom version must be a higher unique SemVer and stale base cannot be delivered', () => {
  assert.throws(
    () => service.createChange({ actor: owner, prototypeId: 'prototype-1', requirement: '改版', versionStrategy: { type: 'custom', value: '1.0.0' } }),
    error => error.code === 'INVALID_VERSION_STRATEGY'
  );
  const created = service.createChange({
    actor: owner,
    prototypeId: 'prototype-1',
    requirement: '改版',
    versionStrategy: { type: 'custom', value: '2.0.0' }
  });
  service.redeemHandoff({ actor: owner, handoffCode: created.handoffCode });
  database.run(`INSERT INTO prototype_versions (prototype_id, version_number, entry_file, sync_source, created_by, size_kb, note, version_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['prototype-1', 2, 'index.html', 'upload', 1, 1, '并行更新', '1.1.0', '2026-08-24T00:01:00.000Z']);
  assert.throws(
    () => service.submitCandidate({ actor: owner, changeId: created.change.id, zipPath: candidateZip('stale.zip') }),
    error => error.code === 'STALE_BASE_VERSION'
  );
});
