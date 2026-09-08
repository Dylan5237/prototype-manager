const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { exec, spawn } = require('node:child_process');

const { buildZip } = require('../src/fuxi-zip');
const {
  buildStandaloneBootstrap,
  buildOnboardingScript,
  renderOnboardingLauncherCommand
} = require('../../backend/services/standalone-bootstrap');

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

test('session-specific onboarding script delegates to standalone bootstrap and completes install', async () => {
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
    let standalone;
    server = http.createServer((req, res) => {
      if (req.url === '/bootstrap') {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': standalone.length });
        res.end(standalone);
        return;
      }
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

    standalone = Buffer.from(buildStandaloneBootstrap({ mcpRoot: path.resolve(__dirname, '..') }));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const onboardingFile = path.join(root, 'fuxi-onboard.cjs');
    fs.writeFileSync(onboardingFile, buildOnboardingScript({
      bootstrapUrl: `${baseUrl}/bootstrap`,
      bootstrapSha256: sha256(standalone),
      sessionEndpoint: `${baseUrl}/session`,
      session: 'opaque-session',
      client: 'generic'
    }));
    const result = await runNode(onboardingFile, [], {
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

test('thin launcher refuses an onboarding script whose SHA-256 does not match', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-standalone-loader-'));
  let server;
  try {
    const onboarding = Buffer.from(`require('node:fs').writeFileSync(process.env.FUXI_TEST_MARKER, 'executed');\n`);
    let onboardingRequests = 0;
    server = http.createServer((req, res) => {
      if (req.url === '/onboarding') {
        onboardingRequests += 1;
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': onboarding.length });
        res.end(onboarding);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const marker = path.join(root, 'executed.txt');
    const command = renderOnboardingLauncherCommand({
      onboardingUrl: `${baseUrl}/onboarding`,
      onboardingSha256: '0'.repeat(64)
    });
    const result = await runShell(command, { ...process.env, FUXI_TEST_MARKER: marker });
    assert(result.error);
    assert.match(`${result.stdout}${result.stderr}`, /ONBOARDING_DIGEST_MISMATCH/);
    assert.equal(onboardingRequests, 1);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('thin launcher retries transient download errors and preserves child structured failures', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-standalone-loader-retry-'));
  let server;
  let onboardingRequests = 0;
  let bootstrapRequests = 0;
  try {
    const structuredFailure = Buffer.from(`process.stdout.write(JSON.stringify({ok:false,status:'FAILED',step:'PRECHECK',error:{code:'CLIENT_CONFIG_REQUIRED',message:'exact child failure'}})+'\\n');process.exitCode=1;\n`);
    let onboarding;
    server = http.createServer((req, res) => {
      if (req.url === '/onboarding') {
        onboardingRequests += 1;
        if (onboardingRequests < 3) {
          res.writeHead(503);
          res.end('temporary');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': onboarding.length });
        res.end(onboarding);
        return;
      }
      if (req.url === '/bootstrap') {
        bootstrapRequests += 1;
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': structuredFailure.length });
        res.end(structuredFailure);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    onboarding = Buffer.from(buildOnboardingScript({
      bootstrapUrl: `${baseUrl}/bootstrap`,
      sessionEndpoint: `${baseUrl}/session`,
      bootstrapSha256: sha256(structuredFailure),
      session: 'opaque-session',
      client: 'generic'
    }));
    const command = renderOnboardingLauncherCommand({
      onboardingUrl: `${baseUrl}/onboarding`,
      onboardingSha256: sha256(onboarding)
    });
    const result = await runShell(command, { ...process.env, FUXI_TEST_ROOT: root });
    assert(result.error);
    assert.match(`${result.stdout}${result.stderr}`, /CLIENT_CONFIG_REQUIRED/);
    assert.match(`${result.stdout}${result.stderr}`, /exact child failure/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /ONBOARDING_LAUNCHER_FAILED|BOOTSTRAP_LOADER_FAILED/);
    assert.equal(onboardingRequests, 3);
    assert.equal(bootstrapRequests, 1);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
