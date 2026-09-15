'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { fork, spawn } = require('child_process');
const database = require('../database/db');

const childScript = path.join(__dirname, 'fixtures', 'db-write-authority-child.js');

function nextMessage(child) {
  return new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
  });
}

function runChild(operation, dbPath) {
  return new Promise((resolve, reject) => {
    const child = fork(childScript, [operation, dbPath], { silent: true });
    let message = null;
    child.on('message', value => { message = value; });
    child.once('error', reject);
    child.once('exit', code => resolve({ code, message }));
  });
}

async function createDatabase(dbPath) {
  await database.initDatabase({ path: dbPath, mode: 'writer' });
  database.run('CREATE TABLE db_authority_probe (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)');
  database.closeDatabase();
}

test('writer lease blocks a concurrent writer while allowing true read-only access', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-db-authority-'));
  const dbPath = path.join(tempRoot, 'app.db');
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  await createDatabase(dbPath);

  const holder = fork(childScript, ['hold', dbPath], { silent: true });
  t.after(() => { if (holder.connected) holder.kill(); });
  assert.deepEqual(await nextMessage(holder), { status: 'ready' });
  const lease = JSON.parse(fs.readFileSync(path.join(`${dbPath}.writer.lock`, 'owner.json'), 'utf8'));
  assert.equal(lease.dbPath, fs.realpathSync(dbPath));
  assert.equal(lease.pid, holder.pid);
  assert.equal(lease.host, os.hostname());
  assert.ok(lease.ownerToken);

  const blocked = await runChild('writer-init', dbPath);
  assert.equal(blocked.code, 1);
  assert.equal(blocked.message.code, 'DB_WRITE_AUTHORITY_HELD');

  const aliasRoot = path.join(tempRoot, 'alias');
  fs.symlinkSync(tempRoot, aliasRoot, 'junction');
  const aliasBlocked = await runChild('writer-init', path.join(aliasRoot, 'app.db'));
  assert.equal(aliasBlocked.code, 1);
  assert.equal(aliasBlocked.message.code, 'DB_WRITE_AUTHORITY_HELD');

  const beforeReadOnly = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
  const readOnly = await runChild('read-only', dbPath);
  assert.equal(readOnly.code, 0);
  assert.equal(readOnly.message.status, 'read-only');
  assert.equal(readOnly.message.mutationCode, 'DB_READ_ONLY');
  assert.equal(readOnly.message.persistCode, 'DB_READ_ONLY');
  const afterReadOnly = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
  assert.equal(afterReadOnly, beforeReadOnly);

  holder.send('release');
  assert.deepEqual(await nextMessage(holder), { status: 'released' });
});

test('read-only initialization does not create a missing database or lease', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-db-readonly-'));
  const dbPath = path.join(tempRoot, 'missing.db');
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const opened = await runChild('read-only-open', dbPath);
  assert.equal(opened.code, 0);
  assert.equal(opened.message.status, 'read-only-opened');
  assert.equal(fs.existsSync(dbPath), false);
  assert.equal(fs.existsSync(`${dbPath}.writer.lock`), false);
});

test('dead local owner lease is recovered but live owner lease is never stolen', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-db-stale-lease-'));
  const dbPath = path.join(tempRoot, 'app.db');
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  await createDatabase(dbPath);

  const leasePath = `${fs.realpathSync(dbPath)}.writer.lock`;
  fs.mkdirSync(leasePath);
  fs.writeFileSync(path.join(leasePath, 'owner.json'), JSON.stringify({
    dbPath: fs.realpathSync(dbPath),
    pid: 2147483647,
    host: os.hostname(),
    ownerToken: 'dead-owner'
  }));
  const recovered = await runChild('writer-init', dbPath);
  assert.equal(recovered.code, 0);
  assert.equal(recovered.message.status, 'writer-ready');
  assert.equal(fs.existsSync(leasePath), false);
});

test('SHA-256 freshness guard rejects stale snapshot after it later obtains authority', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-db-stale-'));
  const dbPath = path.join(tempRoot, 'app.db');
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  await createDatabase(dbPath);

  const stale = fork(childScript, ['stale-reader', dbPath], { silent: true });
  t.after(() => { if (stale.connected) stale.kill(); });
  assert.deepEqual(await nextMessage(stale), { status: 'snapshot-loaded' });

  const writer = await runChild('write-a', dbPath);
  assert.equal(writer.code, 0);
  assert.equal(writer.message.status, 'written');

  stale.send('persist');
  assert.deepEqual(await nextMessage(stale), { status: 'persist-rejected', code: 'STALE_DATABASE_SNAPSHOT' });

  await database.initDatabase({ path: dbPath, mode: 'readOnly' });
  assert.deepEqual(database.query('SELECT value FROM db_authority_probe ORDER BY id'), [{ value: 'from-a' }]);
  database.closeDatabase();
});

test('publish-agent-release direct writer fails closed while backend authority is held', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-db-script-'));
  const dbPath = path.join(tempRoot, 'app.db');
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  await createDatabase(dbPath);

  const holder = fork(childScript, ['hold', dbPath], { silent: true });
  t.after(() => { if (holder.connected) holder.kill(); });
  assert.deepEqual(await nextMessage(holder), { status: 'ready' });

  const script = path.join(__dirname, '..', 'scripts', 'publish-agent-release.js');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--release-id', 'authority-test', '--base-url', 'http://127.0.0.1'], {
      env: { ...process.env, FUXI_DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', code => resolve({ code, stderr }));
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /DB_WRITE_AUTHORITY_HELD/);

  holder.send('release');
  assert.deepEqual(await nextMessage(holder), { status: 'released' });
  const offline = await runChild('writer-init', dbPath);
  assert.equal(offline.code, 0);
  assert.equal(offline.message.status, 'writer-ready');
});
