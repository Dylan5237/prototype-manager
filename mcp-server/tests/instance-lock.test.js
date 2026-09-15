const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  claimMcpInstanceSync,
  instanceLockPath,
  readInstanceRecord
} = require('../src/instance-lock');
const { processIsAlive, refreshLockPath, withRefreshLock } = require('../src/local-lock');

function waitForExit(child) {
  return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}

function waitForSpawnExit(child, timeoutMs = 8000) {
  return Promise.race([
    waitForExit(child),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for process exit')), timeoutMs))
  ]);
}

function collect(stream) {
  let text = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => { text += chunk; });
  return () => text;
}

function spawnHolder(holdMs = 15000) {
  return spawn(process.execPath, ['-e', `setTimeout(() => {}, ${holdMs})`], { stdio: 'ignore' });
}

function spawnMcp(credentialsFile, extraEnv = {}) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      FUXI_API_URL: extraEnv.FUXI_API_URL || 'http://127.0.0.1:9',
      FUXI_CREDENTIALS_FILE: credentialsFile,
      FUXI_TOKEN: '',
      FUXI_CONNECT_CODE: '',
      FUXI_USERNAME: '',
      FUXI_PASSWORD: '',
      FUXI_MCP_INSTANCE_OWNER_PID: '',
      ...extraEnv
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const stderr = collect(child.stderr);
  let buffer = '';
  const replies = new Map();
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        const waiter = replies.get(message.id);
        if (waiter) {
          replies.delete(message.id);
          waiter(message);
        }
      } catch (error) {}
    }
  });
  return {
    child,
    stderr,
    send(method, params = {}) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return new Promise((resolve, reject) => {
        replies.set(id, resolve);
        setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), 8000);
      });
    }
  };
}

test('fail policy keeps a live owner and second start fails closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-instance-fail-'));
  const credentialsFile = path.join(root, 'mcp-credentials.json');
  const holder = spawnHolder();
  try {
    fs.writeFileSync(instanceLockPath(credentialsFile), JSON.stringify({
      schema: 'fuxi-mcp-instance/1',
      pid: holder.pid,
      startedAt: new Date().toISOString()
    }));
    assert.throws(
      () => claimMcpInstanceSync({ credentialsFile, apiUrl: 'http://127.0.0.1:9', policy: 'fail', timeoutMs: 200 }),
      error => error && error.code === 'MCP_INSTANCE_IN_USE'
    );
    assert.equal(processIsAlive(holder.pid), true);
  } finally {
    holder.kill('SIGTERM');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dead PID instance lock is reclaimed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-instance-dead-'));
  const credentialsFile = path.join(root, 'mcp-credentials.json');
  const holder = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  try {
    await waitForExit(holder);
    const lockFile = instanceLockPath(credentialsFile);
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, JSON.stringify({ schema: 'fuxi-mcp-instance/1', pid: holder.pid }));
    const claim = claimMcpInstanceSync({ credentialsFile, apiUrl: 'http://127.0.0.1:9', policy: 'fail', timeoutMs: 200 });
    assert.equal(claim.inherited, false);
    assert.equal(claim.record.pid, process.pid);
    claim.release();
    assert.equal(fs.existsSync(lockFile), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('takeover asks the previous live owner to exit then owns the lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-instance-takeover-'));
  const credentialsFile = path.join(root, 'mcp-credentials.json');
  const holder = spawnHolder(30000);
  try {
    fs.writeFileSync(instanceLockPath(credentialsFile), JSON.stringify({
      schema: 'fuxi-mcp-instance/1',
      pid: holder.pid,
      startedAt: new Date().toISOString()
    }));
    const claim = claimMcpInstanceSync({
      credentialsFile,
      apiUrl: 'http://127.0.0.1:9',
      policy: 'takeover',
      timeoutMs: 4000,
      retryMs: 20
    });
    const exited = await waitForSpawnExit(holder, 4000);
    assert.equal(processIsAlive(holder.pid), false);
    assert.ok(exited.code === 0 || exited.signal === 'SIGTERM' || exited.code === null || exited.code === 143);
    assert.equal(claim.record.pid, process.pid);
    claim.release();
  } finally {
    if (processIsAlive(holder.pid)) holder.kill('SIGTERM');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('shared policy does not take the instance lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-instance-shared-'));
  const credentialsFile = path.join(root, 'mcp-credentials.json');
  try {
    const claim = claimMcpInstanceSync({ credentialsFile, apiUrl: 'http://127.0.0.1:9', policy: 'shared' });
    assert.equal(claim.shared, true);
    assert.equal(fs.existsSync(instanceLockPath(credentialsFile)), false);
    claim.release();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('second MCP process with fail policy exits closed with guidance', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-instance-server-fail-'));
  const credentialsFile = path.join(root, 'mcp-credentials.json');
  const first = spawnMcp(credentialsFile, { FUXI_MCP_INSTANCE_POLICY: 'fail' });
  try {
    const initialized = await first.send('initialize', { protocolVersion: '2024-11-05' });
    assert.equal(initialized.result.serverInfo.name, 'fuxi-platform-mcp-server');
    const record = readInstanceRecord(instanceLockPath(credentialsFile));
    assert.equal(record.pid, first.child.pid);

    const second = spawnMcp(credentialsFile, { FUXI_MCP_INSTANCE_POLICY: 'fail' });
    const exited = await waitForSpawnExit(second.child);
    assert.equal(exited.code, 2);
    assert.match(second.stderr(), /同机同凭证文件只允许一个实例/);
    assert.equal(processIsAlive(first.child.pid), true);
  } finally {
    first.child.kill('SIGTERM');
    await waitForExit(first.child);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('second MCP process with takeover becomes the owner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-instance-server-takeover-'));
  const credentialsFile = path.join(root, 'mcp-credentials.json');
  const first = spawnMcp(credentialsFile, { FUXI_MCP_INSTANCE_POLICY: 'takeover' });
  try {
    await first.send('initialize', { protocolVersion: '2024-11-05' });
    const second = spawnMcp(credentialsFile, { FUXI_MCP_INSTANCE_POLICY: 'takeover' });
    const firstExit = waitForExit(first.child);
    const initialized = await second.send('initialize', { protocolVersion: '2024-11-05' });
    assert.equal(initialized.result.serverInfo.name, 'fuxi-platform-mcp-server');
    await firstExit;
    const record = readInstanceRecord(instanceLockPath(credentialsFile));
    assert.equal(record.pid, second.child.pid);
    second.child.kill('SIGTERM');
    await waitForExit(second.child);
  } finally {
    if (first.child.exitCode === null && first.child.signalCode === null) first.child.kill('SIGTERM');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refresh file lock prevents overlapping cross-process rotation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-refresh-single-flight-'));
  const credentialsFile = path.join(root, 'mcp-credentials.json');
  const logFile = path.join(root, 'refresh-log.jsonl');
  const script = `
    const fs = require('node:fs');
    const { withRefreshLock } = require(${JSON.stringify(path.resolve(__dirname, '../src/local-lock.js'))});
    const credentialsFile = process.env.FUXI_CREDENTIALS_FILE;
    const logFile = process.env.FUXI_REFRESH_LOG;
    (async () => {
      await withRefreshLock(credentialsFile, async () => {
        const startedAt = Date.now();
        await new Promise(resolve => setTimeout(resolve, 120));
        fs.appendFileSync(logFile, JSON.stringify({ pid: process.pid, startedAt, endedAt: Date.now() }) + '\\n');
      });
    })().catch(error => { console.error(error); process.exit(1); });
  `;
  try {
    const env = {
      ...process.env,
      FUXI_CREDENTIALS_FILE: credentialsFile
    };
    const first = spawn(process.execPath, ['-e', script], {
      env: { ...env, FUXI_REFRESH_LOG: logFile },
      stdio: 'ignore'
    });
    const second = spawn(process.execPath, ['-e', script], {
      env: { ...env, FUXI_REFRESH_LOG: logFile },
      stdio: 'ignore'
    });
    const [firstExit, secondExit] = await Promise.all([waitForExit(first), waitForExit(second)]);
    assert.equal(firstExit.code, 0);
    assert.equal(secondExit.code, 0);
    const rows = fs.readFileSync(logFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, 2);
    rows.sort((a, b) => a.startedAt - b.startedAt);
    assert.ok(rows[1].startedAt >= rows[0].endedAt);
    assert.equal(fs.existsSync(refreshLockPath(credentialsFile)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
