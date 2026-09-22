'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const database = require('../database/db');
const { generateToken } = require('../middleware/auth');
const integrationRouter = require('../routes/integrations');
const { createBootstrapSession } = require('../services/db-bootstrap-sessions');

let tempRoot;
let server;
let baseUrl;
let token;
let skillDir;

function request(method, route, bearer = token) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, baseUrl);
    const req = http.request(url, {
      method,
      headers: bearer ? { Authorization: 'Bearer ' + bearer } : {}
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

async function requestJson(method, route, bearer) {
  const response = await request(method, route, bearer);
  let json = null;
  try {
    json = JSON.parse(response.body);
  } catch (error) {
    json = null;
  }
  return { ...response, json };
}

// Creates the canonical Codex onboarding entry the way the dialog does.
async function startCodexBootstrap() {
  const response = await requestJson('GET', '/api/integrations/agent-bootstrap?host=codex');
  assert.equal(response.status, 200, response.body);
  return response.json.data;
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-agent-bootstrap-codex-'));
  await database.initDatabase({ path: path.join(tempRoot, 'app.db'), persist: false, mode: 'writer' });
  database.run(
    'INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [1, 'codex-tester', 'test-hash', 'codex-tester', JSON.stringify(['admin']), '2026-09-22T00:00:00.000Z']
  );
  token = generateToken({ id: 1, username: 'codex-tester', role: ['admin'] });
  skillDir = path.join(tempRoot, 'fuxi-prototype');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: fuxi-prototype\nversion: 9.9.9\n---\n');
  process.env.FUXI_SKILL_DIR = skillDir;
  const app = express();
  app.use(express.json());
  app.use('/api/integrations', integrationRouter);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

test.afterEach(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  server = null;
  delete process.env.FUXI_SKILL_DIR;
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('the onboarding host list exposes Codex as an install-capable Host', async () => {
  const response = await requestJson('GET', '/api/integrations/onboarding-hosts');
  assert.equal(response.status, 200);
  const hosts = response.json.data;
  const codex = hosts.find(host => host.id === 'codex');
  assert.ok(codex, 'Codex must be listed as an onboarding Host');
  assert.equal(codex.mode, 'install');
  assert.equal(codex.label, 'Codex');
  assert.notEqual(codex.support, 'planned');
  assert.equal(hosts.find(host => host.id === 'workbuddy').mode, 'install');
  assert.equal(hosts.find(host => host.id === 'cursor').mode, 'install');
  assert.equal(hosts.find(host => host.id === 'other').mode, 'discovery');
});

test('the Codex onboarding prompt carries the canonical platform entry', async () => {
  const data = await startCodexBootstrap();
  assert.equal(data.mode, 'install');
  assert.equal(data.host.id, 'codex');
  assert.equal(typeof data.prompt, 'string');
  assert.equal(data.prompt.includes('~/.codex/config.toml'), true);
  assert.equal(data.prompt.includes('$HOME/.agents/skills/fuxi-prototype'), true);
  assert.equal(data.prompt.includes(data.canonicalOnboarding.url), true);
  assert.equal(data.prompt.includes(data.canonicalOnboarding.sha256), true);
  assert.equal(data.canonicalOnboarding.command.startsWith('node -e'), true);
  assert.ok(data.bootstrapSession.credential);
  assert.ok(data.bootstrapSession.bootstrapId);
});

test('a Codex bootstrap session returns a codex-bound manifest', async () => {
  const data = await startCodexBootstrap();
  const session = await requestJson('GET', '/api/integrations/bootstrap-session', data.bootstrapSession.credential);
  assert.equal(session.status, 200, session.body);
  const manifest = session.json.data.manifest;
  assert.equal(manifest.schema, 'fuxi-bootstrap/2');
  assert.equal(manifest.client.name, 'codex');
  assert.equal(manifest.bootstrapId, data.bootstrapSession.bootstrapId);
  assert.equal(manifest.apiUrl, baseUrl);
  assert.ok(manifest.installToken);
  assert.ok(manifest.connectCode);
  assert.equal(manifest.artifacts.mcp.url.includes(manifest.bootstrapId), true);
  assert.equal(manifest.artifacts.skill.url.includes(manifest.bootstrapId), true);
});

test('the bootstrap session refuses a Host that does not match the session', async () => {
  const data = await startCodexBootstrap();
  const mismatched = await requestJson('GET', '/api/integrations/bootstrap-session?client=cursor', data.bootstrapSession.credential);
  assert.equal(mismatched.status, 400);
  assert.equal(mismatched.json.code, 'HOST_SELECTION_MISMATCH');
});

test('a session bound to a non-install Host is refused before any artifact is served', async () => {
  for (const client of ['other', '', 'unknown-tool']) {
    const session = createBootstrapSession({ userId: 1, apiUrl: baseUrl, client });
    const response = await requestJson('GET', '/api/integrations/bootstrap-session', session.credential);
    assert.equal(response.status, 409, 'client=' + JSON.stringify(client));
    assert.equal(response.json.code, 'BOOTSTRAP_HOST_UNBOUND');
  }
});

test('the platform bootstrap artifact resolves the Codex targets on a clean machine', async () => {
  const pkg = await request('GET', '/api/integrations/bootstrap-package');
  assert.equal(pkg.status, 200, pkg.body);
  assert.equal(pkg.body.includes('readMcpServers'), true, 'the bundle must ship the Codex TOML reader');
  assert.equal(pkg.body.includes('upsertMcpServer'), true, 'the bundle must ship the Codex TOML writer');

  const home = path.join(tempRoot, 'clean-home');
  const configFile = path.join(home, '.codex', 'config.toml');
  // 既有配置里同时放：无关 server、伏羲自有条目、以及用户加在伏羲 env 里的变量。
  // 这样 preflight 会走完整读取路径，并如实上报未管理内容（含 env 变量）。
  const unrelated = [
    '[mcp_servers.other]',
    'command = "node"',
    '',
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'FUXI_API_URL = "http://stale.invalid"',
    'NODE_OPTIONS = "--max-old-space-size=4096"',
    ''
  ].join('\n');
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, unrelated);
  const script = path.join(tempRoot, 'fuxi-bootstrap.cjs');
  fs.writeFileSync(script, pkg.body);
  const manifestFile = path.join(tempRoot, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify({
    schema: 'fuxi-bootstrap/2',
    bootstrapId: 'codex-clean-machine',
    apiUrl: 'http://127.0.0.1:3001',
    client: { name: 'codex' }
  }));

  const childEnv = { ...process.env, USERPROFILE: home, HOME: home };
  delete childEnv.FUXI_MCP_CONFIG;
  delete childEnv.FUXI_SKILL_TARGET;
  delete childEnv.FUXI_CLIENT;
  delete childEnv.FUXI_SKILL_DIR;
  const result = spawnSync(process.execPath, [script, 'preflight', '--manifest', manifestFile], {
    encoding: 'utf8',
    env: childEnv
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.client, 'codex');
  assert.equal(plan.status, 'READY');
  assert.equal(plan.configFormat, 'toml');
  assert.deepEqual(plan.existingMcpEntries, ['other', 'fuxi-platform']);
  assert.deepEqual(plan.unmanagedFuxiEnvKeys, ['NODE_OPTIONS']);
  assert.deepEqual(plan.unmanagedFuxiEntryKeys, ['mcp_servers.fuxi-platform.env.NODE_OPTIONS']);
  assert.equal(plan.configExists, true);
  assert.equal(plan.mcpConfig, path.join(home, '.codex', 'config.toml'));
  assert.equal(plan.skillTarget, path.join(home, '.agents', 'skills', 'fuxi-prototype'));
  assert.equal(plan.writable, true);
  assert.equal(fs.readFileSync(configFile, 'utf8'), unrelated, 'preflight must not modify the Codex config');
  assert.equal(fs.existsSync(path.join(home, '.agents')), false, 'preflight must not create the Skill root');
});
