const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { buildZip } = require('../src/fuxi-zip');
const {
  BootstrapError,
  acquireBootstrapLock,
  clientTargets,
  extractPackage,
  install,
  mergeMcpConfig,
  preflight,
  verify
} = require('../src/bootstrap');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function writeFixture(root, relative, content) {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function packageZip(root, packageName, files) {
  const absoluteFiles = files.map(([entry, content]) => ({
    entry: `${packageName}/${entry}`,
    absolute: writeFixture(root, `${packageName}/${entry}`, content)
  }));
  return buildZip(absoluteFiles);
}

function fakeMcpServer() {
  return `
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { serverInfo: { name: 'fake' } } }) + '\\n');
    } else if (message.method === 'tools/call') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, authentication: 'verified', runtime: { mcpVersion: 'test', skillVersion: 'test' } }) }] } }) + '\\n');
    }
  }
});
`;
}

test('preflight requires explicit paths for an unknown client and reports existing MCP entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-bootstrap-preflight-'));
  try {
    const config = path.join(root, 'mcp.json');
    const skill = path.join(root, 'skills', 'fuxi-prototype');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(config, JSON.stringify({ mcpServers: { existing: { command: 'node' } } }));
    const manifest = { schema: 'fuxi-bootstrap/2', bootstrapId: 'preflight-1', apiUrl: 'http://127.0.0.1', client: { name: 'generic' } };
    const plan = preflight(manifest, { 'mcp-config': config, 'skill-target': skill });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.existingMcpEntries, ['existing']);
    assert.equal(plan.configFormat, 'json');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clientTargets resolves the verified WorkBuddy native paths without broad discovery', () => {
  const manifest = { schema: 'fuxi-bootstrap/2', bootstrapId: 'workbuddy-1', apiUrl: 'http://127.0.0.1', client: { name: 'workbuddy' } };
  const targets = clientTargets(manifest);
  assert.equal(targets.name, 'workbuddy');
  assert.equal(targets.mcpConfig, path.join(os.homedir(), '.workbuddy', 'mcp.json'));
  assert.equal(targets.skillTarget, path.join(os.homedir(), '.workbuddy', 'skills', 'fuxi-prototype'));
});

test('mergeMcpConfig preserves existing MCP entries and replaces only Fuxi', () => {
  const existing = { settings: { keep: true }, mcpServers: { other: { command: 'node', args: ['other.js'] } } };
  const merged = mergeMcpConfig(existing, { command: 'node', args: ['launcher.js'] });
  assert.deepEqual(merged.settings, existing.settings);
  assert.deepEqual(merged.mcpServers.other, existing.mcpServers.other);
  assert.deepEqual(merged.mcpServers['fuxi-platform'], { command: 'node', args: ['launcher.js'] });
});

test('bootstrap install uses a shared lock and returns idempotent success for a completed install', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-bootstrap-lock-'));
  try {
    const lockFile = path.join(root, 'install', 'update.lock');
    const release = acquireBootstrapLock(lockFile);
    try {
      assert.throws(
        () => acquireBootstrapLock(lockFile),
        error => error instanceof BootstrapError && error.code === 'BOOTSTRAP_LOCKED'
      );
    } finally {
      release();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractPackage rejects unsafe ZIP entries before writing outside staging', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-bootstrap-zip-'));
  try {
    const skillFile = writeFixture(root, 'fixture-SKILL.md', '---\nname: fuxi-prototype\n---\n');
    const safeFixture = writeFixture(root, 'fixture-safe.txt', 'no');
    const zip = buildZip([
      { entry: 'fuxi-prototype/SKILL.md', absolute: skillFile },
      { entry: 'fuxi-prototype/../escape.txt', absolute: safeFixture }
    ]);
    assert.throws(
      () => extractPackage(zip, path.join(root, 'staging'), 'skill'),
      error => error instanceof BootstrapError && error.code === 'ARTIFACT_UNSAFE_PATH'
    );
    assert.equal(fs.existsSync(path.join(root, 'escape.txt')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('install downloads in parallel, reuses local ZIPs, preserves other MCP entries, self-tests, and verifies state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-bootstrap-install-'));
  let server;
  try {
    const mcpZip = packageZip(root, 'fuxi-platform-mcp', [
      ['src/server.js', fakeMcpServer()],
      ['src/launcher.js', '#!/usr/bin/env node\n'],
      ['src/bootstrap.js', '#!/usr/bin/env node\n'],
      ['src/local-lock.js', 'module.exports = {};\n'],
      ['package.json', '{"name":"fuxi-platform-mcp","version":"test"}\n']
    ]);
    const skillZip = packageZip(root, 'fuxi-prototype', [['SKILL.md', '---\nname: fuxi-prototype\n---\n']]);
    const mcpZipPath = writeFixture(root, 'downloads/mcp.zip', mcpZip);
    const skillZipPath = writeFixture(root, 'downloads/skill.zip', skillZip);
    let requestCount = 0;
    server = http.createServer((req, res) => {
      requestCount += 1;
      const body = req.url === '/mcp.zip' ? mcpZip : req.url === '/skill.zip' ? skillZip : null;
      if (!body) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': body.length });
      res.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const apiUrl = `http://127.0.0.1:${server.address().port}`;
    const config = path.join(root, 'client', 'mcp.json');
    const skillTarget = path.join(root, 'client', 'skills', 'fuxi-prototype');
    const installRoot = path.join(root, 'runtime');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.mkdirSync(path.dirname(skillTarget), { recursive: true });
    fs.writeFileSync(config, JSON.stringify({ mcpServers: { other: { command: 'node' } } }, null, 2));
    const manifest = {
      schema: 'fuxi-bootstrap/2',
      bootstrapId: 'install-1',
      apiUrl,
      installToken: 'test-install-token',
      connectCode: 'test-connect-code',
      artifacts: {
        mcp: { url: `${apiUrl}/mcp.zip`, sha256: sha256(mcpZip), size: mcpZip.length },
        skill: { url: `${apiUrl}/skill.zip`, sha256: sha256(skillZip), size: skillZip.length }
      },
      client: { name: 'generic' }
    };
    const state = await install(manifest, {
      'mcp-config': config,
      'skill-target': skillTarget,
      'install-root': installRoot,
      state: path.join(installRoot, 'state.json'),
      'timeout-ms': 5000
    });
    assert.equal(state.status, 'COMPLETE');
    assert.equal(state.mcpConnected, true);
    assert.equal(state.skillReady, true);
    assert.equal(typeof state.timings.totalMs, 'number');
    const configured = JSON.parse(fs.readFileSync(config, 'utf8'));
    assert.deepEqual(configured.mcpServers.other, { command: 'node' });
    assert.equal(configured.mcpServers['fuxi-platform'].env.FUXI_CONNECT_CODE, undefined);
    assert.equal(fs.existsSync(path.join(skillTarget, 'SKILL.md')), true);
    const verified = verify(state.statePath);
    assert.equal(verified.ok, true);
    assert.equal(verified.checks.config, true);
    assert.equal(requestCount, 2);

    const repeated = await install(manifest, {
      'mcp-config': config,
      'skill-target': skillTarget,
      'install-root': installRoot,
      state: path.join(installRoot, 'state.json'),
      'mcp-zip': mcpZipPath,
      'skill-zip': skillZipPath,
      'timeout-ms': 5000
    });
    assert.equal(repeated.status, 'COMPLETE');
    assert.equal(repeated.reason, 'ALREADY_COMPLETE');
    assert.equal(requestCount, 2);

    const localConfig = path.join(root, 'client-local', 'mcp.json');
    const localSkillTarget = path.join(root, 'client-local', 'skills', 'fuxi-prototype');
    fs.mkdirSync(path.dirname(localConfig), { recursive: true });
    fs.mkdirSync(path.dirname(localSkillTarget), { recursive: true });
    fs.writeFileSync(localConfig, JSON.stringify({ mcpServers: { other: { command: 'node' } } }, null, 2));
    const localState = await install(manifest, {
      'mcp-config': localConfig,
      'skill-target': localSkillTarget,
      'install-root': path.join(root, 'runtime-local'),
      state: path.join(root, 'runtime-local', 'state.json'),
      'mcp-zip': mcpZipPath,
      'skill-zip': skillZipPath,
      'timeout-ms': 5000
    });
    assert.equal(localState.status, 'COMPLETE');
    assert.equal(requestCount, 2);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
