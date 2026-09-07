const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { exec, spawn } = require('node:child_process');

const { buildZip } = require('../src/fuxi-zip');
const { buildStandaloneBootstrap, renderCanonicalBootstrapCommand } = require('../../backend/services/standalone-bootstrap');

function writeFixture(root, relative, content) {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function packageZip(root, packageName, files) {
  return buildZip(files.map(([entry, content]) => ({
    entry: `${packageName}/${entry}`,
    absolute: writeFixture(root, `${packageName}/${entry}`, content)
  })));
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
    if (message.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\\n');
    if (message.method === 'tools/call') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, authentication: 'verified' }) }] } }) + '\\n');
  }
});
`;
}

function sha256(buffer) {
  return require('node:crypto').createHash('sha256').update(buffer).digest('hex');
}

function runNode(file, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

function runShell(command, env) {
  return new Promise(resolve => {
    exec(command, { env, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

test('standalone bootstrap fetches a session manifest and completes install without local ZIPs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-standalone-bootstrap-'));
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
    const clientRoot = path.join(root, 'client');
    const mcpConfig = path.join(clientRoot, 'mcp.json');
    const skillTarget = path.join(clientRoot, 'skills', 'fuxi-prototype');
    fs.mkdirSync(clientRoot, { recursive: true });
    fs.mkdirSync(path.dirname(skillTarget), { recursive: true });
    const apiRoot = path.join(root, 'home');
    let sessionRequests = 0;
    server = http.createServer((req, res) => {
      if (req.url === '/session') {
        sessionRequests += 1;
        const manifest = {
          schema: 'fuxi-bootstrap/2',
          bootstrapId: 'standalone-test-1',
          apiUrl: `http://127.0.0.1:${server.address().port}`,
          installToken: 'test-install-token',
          connectCode: 'test-connect-code',
          artifacts: {
            mcp: { url: `http://127.0.0.1:${server.address().port}/mcp`, sha256: sha256(mcpZip), size: mcpZip.length },
            skill: { url: `http://127.0.0.1:${server.address().port}/skill`, sha256: sha256(skillZip), size: skillZip.length }
          },
          client: { name: 'generic', mcpConfig, skillTarget }
        };
        const body = JSON.stringify({ success: true, data: { manifest } });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
        return;
      }
      const body = req.url === '/mcp' ? mcpZip : req.url === '/skill' ? skillZip : null;
      if (!body) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': body.length });
      res.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    const standaloneFile = path.join(root, 'fuxi-bootstrap.cjs');
    const standalone = Buffer.from(buildStandaloneBootstrap({ mcpRoot: path.resolve(__dirname, '..') }));
    fs.writeFileSync(standaloneFile, standalone);
    const result = await runNode(standaloneFile, [
      'connect', '--session', 'opaque-session', '--endpoint', `http://127.0.0.1:${server.address().port}/session`, '--client', 'generic'
    ], {
      ...process.env,
      HOME: apiRoot,
      USERPROFILE: apiRoot
    });

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(sessionRequests, 1);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.status, 'COMPLETE');
    assert.equal(output.mcpConnected, true);
    assert.equal(output.skillReady, true);
    assert.equal(fs.existsSync(path.join(skillTarget, 'SKILL.md')), true);
    assert.equal(fs.existsSync(mcpConfig), true);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('canonical loader refuses a standalone artifact whose SHA-256 does not match', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-standalone-loader-'));
  let server;
  try {
    const standalone = Buffer.from(buildStandaloneBootstrap({ mcpRoot: path.resolve(__dirname, '..') }));
    let bootstrapRequests = 0;
    server = http.createServer((req, res) => {
      if (req.url === '/bootstrap') {
        bootstrapRequests += 1;
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': standalone.length });
        res.end(standalone);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const command = renderCanonicalBootstrapCommand({
      bootstrapUrl: `${baseUrl}/bootstrap`,
      sessionEndpoint: `${baseUrl}/session`,
      bootstrapSha256: '0'.repeat(64),
      session: 'opaque-session',
      client: 'generic'
    });
    const result = await runShell(command, { ...process.env, FUXI_TEST_ROOT: root });
    assert(result.error);
    assert.match(`${result.stdout}${result.stderr}`, /BOOTSTRAP_DIGEST_MISMATCH/);
    assert.equal(bootstrapRequests, 1);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('canonical loader retries transient standalone download failures before starting Bootstrap', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-standalone-loader-retry-'));
  let server;
  let bootstrapRequests = 0;
  let sessionRequests = 0;
  try {
    const standalone = Buffer.from(buildStandaloneBootstrap({ mcpRoot: path.resolve(__dirname, '..') }));
    server = http.createServer((req, res) => {
      if (req.url === '/bootstrap') {
        bootstrapRequests += 1;
        if (bootstrapRequests < 3) {
          res.writeHead(503);
          res.end('temporary');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': standalone.length });
        res.end(standalone);
        return;
      }
      if (req.url === '/session') {
        sessionRequests += 1;
        res.writeHead(401);
        res.end('invalid session');
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const command = renderCanonicalBootstrapCommand({
      bootstrapUrl: `${baseUrl}/bootstrap`,
      sessionEndpoint: `${baseUrl}/session`,
      bootstrapSha256: require('node:crypto').createHash('sha256').update(standalone).digest('hex'),
      session: 'opaque-session',
      client: 'generic'
    });
    const result = await runShell(command, { ...process.env, FUXI_TEST_ROOT: root });
    assert(result.error);
    assert.match(`${result.stdout}${result.stderr}`, /BOOTSTRAP_SESSION_INVALID/);
    assert.equal(bootstrapRequests, 3);
    assert.equal(sessionRequests, 1);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
