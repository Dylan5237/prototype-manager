const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { prepareArtifactBundle, commitArtifactBundle, getArtifactMetadata, artifactFile } = require('../../backend/services/agent-artifacts');
const { prepareStartup, readJson, paths, reportSessionRuntime } = require('../src/update-runtime');

let tempRoot;
let sourceRoot;
let server;
let previousAgentRoot;
let previousToken;
let previousSkillTarget;
let previousCanonicalSkillTarget;
let previousLegacySkillTarget;
let heartbeatPayload;

function json(res, value, status = 200) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-remote-update-'));
  sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-remote-source-'));
  previousAgentRoot = process.env.FUXI_AGENT_RELEASE_ROOT;
  previousToken = process.env.FUXI_TOKEN;
  previousSkillTarget = process.env.FUXI_SKILL_TARGET;
  previousCanonicalSkillTarget = process.env.FUXI_CANONICAL_SKILL_TARGET;
  previousLegacySkillTarget = process.env.FUXI_LEGACY_SKILL_TARGET;
  heartbeatPayload = null;
  process.env.FUXI_AGENT_RELEASE_ROOT = path.join(tempRoot, 'server-artifacts');
  process.env.FUXI_TOKEN = 'test-access-token';
  process.env.FUXI_SKILL_TARGET = path.join(tempRoot, 'native-skill');
  process.env.FUXI_CANONICAL_SKILL_TARGET = path.join(tempRoot, 'canonical-skill');
  process.env.FUXI_LEGACY_SKILL_TARGET = path.join(tempRoot, 'legacy-skill');

  fs.mkdirSync(path.join(sourceRoot, 'mcp', 'src'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'skill'), { recursive: true });
  fs.cpSync(path.join(__dirname, '..', 'src', 'server.js'), path.join(sourceRoot, 'mcp', 'src', 'server.js'));
  fs.cpSync(path.join(__dirname, '..', 'src', 'fuxi-zip.js'), path.join(sourceRoot, 'mcp', 'src', 'fuxi-zip.js'));
  fs.cpSync(path.join(__dirname, '..', 'src', 'launcher.js'), path.join(sourceRoot, 'mcp', 'src', 'launcher.js'));
  fs.cpSync(path.join(__dirname, '..', 'src', 'bootstrap.js'), path.join(sourceRoot, 'mcp', 'src', 'bootstrap.js'));
  fs.cpSync(path.join(__dirname, '..', 'src', 'local-lock.js'), path.join(sourceRoot, 'mcp', 'src', 'local-lock.js'));
  fs.cpSync(path.join(__dirname, '..', 'package.json'), path.join(sourceRoot, 'mcp', 'package.json'));
  fs.writeFileSync(path.join(sourceRoot, 'skill', 'SKILL.md'), '---\nname: fuxi-prototype\n---\n\n# Test Skill\n');
  fs.mkdirSync(process.env.FUXI_SKILL_TARGET, { recursive: true });
  fs.writeFileSync(path.join(process.env.FUXI_SKILL_TARGET, 'SKILL.md'), '---\nname: fuxi-prototype\n---\n\n# Legacy Skill\n');

  const bundle = prepareArtifactBundle({
    releaseId: 'remote-v2',
    mcpDir: path.join(sourceRoot, 'mcp'),
    skillDir: path.join(sourceRoot, 'skill')
  });
  commitArtifactBundle(bundle);
  const mcp = getArtifactMetadata('remote-v2', 'mcp');
  const skill = getArtifactMetadata('remote-v2', 'skill');

  server = http.createServer((req, res) => {
    if (req.url === '/api/auth/mcp/heartbeat') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        heartbeatPayload = JSON.parse(body);
        return json(res, { success: true, data: { session: heartbeatPayload, updates: [] } });
      });
      return;
    }
    if (req.url === '/api/integrations/update-intents/claim') {
      return json(res, {
        success: true,
        data: {
          claimed: true,
          intent: {
            id: 'intent-remote-v2',
            release: {
              releaseId: 'remote-v2',
              mcpVersion: '0.2.0',
              skillVersion: '0.2.0',
              manifest: {
                releaseId: 'remote-v2',
                mcpVersion: '0.2.0',
                skillVersion: '0.2.0',
                artifacts: {
                  mcp: { url: '/artifacts/mcp.zip', size: mcp.size, sha256: mcp.sha256 },
                  skill: { url: '/artifacts/skill.zip', size: skill.size, sha256: skill.sha256 }
                }
              }
            }
          }
        }
      });
    }
    if (req.url === '/artifacts/mcp.zip') return res.end(fs.readFileSync(artifactFile('remote-v2', 'mcp')));
    if (req.url === '/artifacts/skill.zip') return res.end(fs.readFileSync(artifactFile('remote-v2', 'skill')));
    return json(res, { success: false, code: 'NOT_FOUND' }, 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
});

test.afterEach(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (previousAgentRoot === undefined) delete process.env.FUXI_AGENT_RELEASE_ROOT;
  else process.env.FUXI_AGENT_RELEASE_ROOT = previousAgentRoot;
  if (previousToken === undefined) delete process.env.FUXI_TOKEN;
  else process.env.FUXI_TOKEN = previousToken;
  if (previousSkillTarget === undefined) delete process.env.FUXI_SKILL_TARGET;
  else process.env.FUXI_SKILL_TARGET = previousSkillTarget;
  if (previousCanonicalSkillTarget === undefined) delete process.env.FUXI_CANONICAL_SKILL_TARGET;
  else process.env.FUXI_CANONICAL_SKILL_TARGET = previousCanonicalSkillTarget;
  if (previousLegacySkillTarget === undefined) delete process.env.FUXI_LEGACY_SKILL_TARGET;
  else process.env.FUXI_LEGACY_SKILL_TARGET = previousLegacySkillTarget;
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.rmSync(sourceRoot, { recursive: true, force: true });
});

test('remote claim downloads, verifies, smokes, and installs a release before MCP start', async () => {
  const port = server.address().port;
  const apiUrl = `http://127.0.0.1:${port}`;
  const credentialsFile = path.join(tempRoot, 'credentials.json');
  const installRoot = path.join(tempRoot, 'client-runtime');
  fs.writeFileSync(credentialsFile, JSON.stringify({
    apiUrl,
    refreshToken: 'refresh-token-not-printed',
    sessionId: 'session-1'
  }));
  const startup = await prepareStartup({
    apiUrl,
    credentialsFile,
    installRoot,
    deviceLabel: 'remote-update-test'
  });
  assert.equal(startup.update.status, 'READY_TO_START');
  assert.equal(startup.update.releaseId, 'remote-v2');
  const installed = readJson(paths(installRoot).current);
  assert.equal(installed.mcpVersion, '0.2.0');
  assert.equal(installed.skillVersion, '0.2.0');
  assert.equal(fs.existsSync(path.join(installed.mcpPath, 'src', 'server.js')), true);
  assert.equal(fs.existsSync(path.join(installed.skillPath, 'SKILL.md')), true);
  assert.match(fs.readFileSync(path.join(process.env.FUXI_SKILL_TARGET, 'SKILL.md'), 'utf8'), /Test Skill/);
});

test('launcher runtime heartbeat reports versions for legacy MCP targets', async () => {
  const port = server.address().port;
  const data = await reportSessionRuntime({
    apiUrl: `http://127.0.0.1:${port}`,
    token: 'test-access-token',
    sessionId: 'session-legacy',
    mcpVersion: '0.1.0',
    skillVersion: '0.1.0',
    runtimeVersion: 'v20.0.0',
    platform: 'win32'
  });
  assert.equal(data.session.mcpVersion, '0.1.0');
  assert.deepEqual(heartbeatPayload, {
    sessionId: 'session-legacy',
    mcpVersion: '0.1.0',
    skillVersion: '0.1.0',
    runtimeVersion: 'v20.0.0',
    platform: 'win32'
  });
});

test('migrates an installed legacy skill to the canonical target when no explicit target is configured', async () => {
  const port = server.address().port;
  const apiUrl = `http://127.0.0.1:${port}`;
  const credentialsFile = path.join(tempRoot, 'credentials-migration.json');
  fs.writeFileSync(credentialsFile, JSON.stringify({
    apiUrl,
    refreshToken: 'refresh-token-not-printed',
    sessionId: 'session-migration'
  }));
  fs.mkdirSync(process.env.FUXI_LEGACY_SKILL_TARGET, { recursive: true });
  fs.writeFileSync(path.join(process.env.FUXI_LEGACY_SKILL_TARGET, 'SKILL.md'), '# Legacy Installed Skill\n');
  delete process.env.FUXI_SKILL_TARGET;
  const startup = await prepareStartup({
    apiUrl,
    credentialsFile,
    installRoot: path.join(tempRoot, 'migration-runtime'),
    deviceLabel: 'legacy-migration-test'
  });
  assert.equal(startup.update.status, 'READY_TO_START');
  assert.match(fs.readFileSync(path.join(process.env.FUXI_CANONICAL_SKILL_TARGET, 'SKILL.md'), 'utf8'), /Test Skill/);
  assert.equal(fs.existsSync(process.env.FUXI_LEGACY_SKILL_TARGET), false);
});
