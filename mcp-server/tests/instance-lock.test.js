const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { writeJsonAtomic } = require('../src/atomic-write');
const { acquireMcpInstanceSync, instancePaths } = require('../src/instance-lock');
const { processIsAlive } = require('../src/local-lock');

function waitForExit(child) {
  return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}

function collectStderr(child) {
  let text = '';
  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { text += chunk; });
  }
  return () => text;
}

test('atomic json write replaces via temp file then rename', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-atomic-write-'));
  try {
    const file = path.join(root, 'credentials.json');
    writeJsonAtomic(file, { ok: 1, token: 'first' }, { mode: 0o600 });
    writeJsonAtomic(file, { ok: 2, token: 'second' }, { mode: 0o600 });
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(parsed, { ok: 2, token: 'second' });
    assert.equal(fs.readdirSync(root).some(name => name.includes('.tmp-')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('same credentials/installRoot/apiUrl admits only one live MCP instance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-instance-lock-'));
  let first;
  try {
    const options = {
      credentialsFile: path.join(root, 'mcp-credentials.json'),
      installRoot: path.join(root, 'runtime'),
      apiUrl: 'http://127.0.0.1:16088',
      role: 'server'
    };
    fs.writeFileSync(options.credentialsFile, '{}\n');
    first = acquireMcpInstanceSync(options);
    assert.equal(first.status, 'acquired');
    const second = acquireMcpInstanceSync(options);
    assert.equal(second.status, 'already_running');
    assert.equal(second.owner.pid, process.pid);
    const paths = instancePaths(options);
    assert.equal(fs.existsSync(paths.lockFile), true);
    first.unlock();
    assert.equal(fs.existsSync(paths.lockFile), false);
    assert.equal(fs.existsSync(paths.stateFile), false);
  } finally {
    if (first && first.unlock) first.unlock();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stale instance pid is taken over and leftover child is stopped', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-stale-instance-'));
  let leftover;
  let acquired;
  try {
    const credentialsFile = path.join(root, 'mcp-credentials.json');
    const installRoot = path.join(root, 'runtime');
    const apiUrl = 'http://127.0.0.1:16077';
    fs.writeFileSync(credentialsFile, '{}\n');
    leftover = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore'
    });
    await new Promise(resolve => leftover.once('spawn', resolve));
    assert.equal(processIsAlive(leftover.pid), true);

    const paths = instancePaths({ credentialsFile, installRoot, apiUrl });
    fs.mkdirSync(path.dirname(paths.lockFile), { recursive: true });
    fs.writeFileSync(paths.lockFile, '99999999\n');
    writeJsonAtomic(paths.stateFile, {
      pid: 99999999,
      serverPid: leftover.pid,
      role: 'launcher',
      credentialsFile,
      installRoot,
      apiUrl,
      startedAt: new Date().toISOString()
    });

    acquired = acquireMcpInstanceSync({
      credentialsFile,
      installRoot,
      apiUrl,
      role: 'server'
    });
    assert.equal(acquired.status, 'acquired');
    assert.equal(acquired.owner.pid, process.pid);
    if (processIsAlive(leftover.pid)) await waitForExit(leftover);
    assert.equal(processIsAlive(leftover.pid), false);
    leftover = null;
    acquired.unlock();
  } finally {
    if (acquired && acquired.unlock) acquired.unlock();
    if (leftover && leftover.pid && processIsAlive(leftover.pid)) leftover.kill('SIGKILL');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('second server.js for the same identity exits cleanly without starting RPC', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-server-instance-'));
  try {
    const credentialsFile = path.join(root, 'mcp-credentials.json');
    const installRoot = path.join(root, 'runtime');
    fs.writeFileSync(credentialsFile, JSON.stringify({
      apiUrl: 'http://127.0.0.1:9',
      refreshToken: 'refresh',
      sessionId: 'session-1'
    }));
    const env = {
      ...process.env,
      FUXI_API_URL: 'http://127.0.0.1:9',
      FUXI_CREDENTIALS_FILE: credentialsFile,
      FUXI_INSTALL_ROOT: installRoot,
      FUXI_TOKEN: '',
      FUXI_CONNECT_CODE: '',
      FUXI_USERNAME: '',
      FUXI_PASSWORD: ''
    };
    delete env.FUXI_MCP_ALLOW_MULTI;
    delete env.FUXI_MCP_INSTANCE_LOCK_HELD;
    const first = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const firstStderr = collectStderr(first);
    try {
      first.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`first server did not initialize: ${firstStderr()}`)), 5000);
        let buffer = '';
        first.stdout.setEncoding('utf8');
        first.stdout.on('data', chunk => {
          buffer += chunk;
          if (buffer.includes('"id":1')) {
            clearTimeout(timer);
            resolve();
          }
        });
        first.on('exit', (code, signal) => {
          clearTimeout(timer);
          reject(new Error(`first server exited early code=${code} signal=${signal} stderr=${firstStderr()}`));
        });
      });

      const second = spawn(process.execPath, ['src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const secondStderr = collectStderr(second);
      const exited = await waitForExit(second);
      assert.equal(exited.code, 0);
      assert.match(secondStderr(), /MCP_ALREADY_RUNNING/);
    } finally {
      first.kill('SIGTERM');
      await waitForExit(first);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
