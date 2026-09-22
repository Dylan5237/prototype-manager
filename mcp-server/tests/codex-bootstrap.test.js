'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildZip } = require('../src/fuxi-zip');
const { FUXI_MANAGED_ENV_KEYS } = require('../src/fuxi-toml');
const {
  BootstrapError,
  clientTargets,
  codexDefaultMcpConfig,
  codexDefaultSkillTarget,
  install,
  mcpEntry,
  preflight,
  readConfigDocument,
  verify
} = require('../src/bootstrap');

const SKILL_BASENAME = 'fuxi-prototype';

// Unrelated user configuration that must survive a Codex install byte for byte.
const CODEX_USER_CONFIG = [
  'approval_policy = "never"',
  'model = "gpt-5.6-codex"',
  '',
  '[windows]',
  'sandbox = "elevated"',
  '',
  '[mcp_servers.other]',
  'command = "node"',
  '',
  '[mcp_servers.other.env]',
  'OTHER_FLAG = "1"',
  '',
  '[[skills.config]]',
  'name = "neat-freak"',
  ''
].join('\n');

const CODEX_MANIFEST = {
  schema: 'fuxi-bootstrap/2',
  bootstrapId: 'codex-1',
  apiUrl: 'http://127.0.0.1',
  client: { name: 'codex' }
};

const VERIFIED_RESULT = { ok: true, authentication: 'verified', runtime: { mcpVersion: 'test', skillVersion: 'test' } };

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
    entry: packageName + '/' + entry,
    absolute: writeFixture(root, packageName + '/' + entry, content)
  }));
  return buildZip(absoluteFiles);
}

// The fake MCP server reports the check_connection result the test asks for.
function fakeMcpServer(result) {
  const payload = JSON.stringify(JSON.stringify(result));
  return [
    'const NL = String.fromCharCode(10);',
    "let buffer = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', chunk => {",
    '  buffer += chunk;',
    '  let index;',
    '  while ((index = buffer.indexOf(NL)) >= 0) {',
    '    const line = buffer.slice(0, index).trim();',
    '    buffer = buffer.slice(index + 1);',
    '    if (!line) continue;',
    '    const message = JSON.parse(line);',
    "    if (message.method === 'initialize') {",
    "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { serverInfo: { name: 'fake' } } }) + NL);",
    "    } else if (message.method === 'tools/call') {",
    "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: " + payload + " }] } }) + NL);",
    '    }',
    '  }',
    '});',
    ''
  ].join('\n');
}

function mcpPackageZip(root, result) {
  return packageZip(root, 'fuxi-platform-mcp', [
    ['src/server.js', fakeMcpServer(result)],
    ['src/launcher.js', '#!/usr/bin/env node\n'],
    ['src/bootstrap.js', '#!/usr/bin/env node\n'],
    ['src/fuxi-toml.js', "'use strict';\n"],
    ['src/local-lock.js', 'module.exports = {};\n'],
    ['src/instance-lock.js', 'module.exports = {};\n'],
    ['package.json', '{"name":"fuxi-platform-mcp","version":"test"}\n']
  ]);
}

function skillPackageZip(root) {
  return packageZip(root, SKILL_BASENAME, [['SKILL.md', '---\nname: fuxi-prototype\n---\n']]);
}

// Runs a real install against a temporary HOME so nothing touches the operator
// own Codex configuration. The ZIP bytes are passed in so a repeated run can
// reuse the exact same artifacts.
async function runCodexInstall({ root, home, mcpZip, skillZip, seedConfig = true }) {
  const installRoot = path.join(root, 'runtime');
  const configFile = path.join(home, '.codex', 'config.toml');
  const skillTarget = path.join(home, '.agents', 'skills', SKILL_BASENAME);
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  if (seedConfig) fs.writeFileSync(configFile, CODEX_USER_CONFIG);
  const originalHomedir = os.homedir;
  os.homedir = () => home;
  try {
    const state = await install(
      {
        ...CODEX_MANIFEST,
        artifacts: {
          mcp: { url: 'http://127.0.0.1/mcp.zip', sha256: sha256(mcpZip), size: mcpZip.length },
          skill: { url: 'http://127.0.0.1/skill.zip', sha256: sha256(skillZip), size: skillZip.length }
        }
      },
      {
        'install-root': installRoot,
        'credentials-file': path.join(home, '.fuxi', 'mcp-credentials.json'),
        state: path.join(installRoot, 'bootstrap-state.json'),
        'mcp-zip': writeFixture(root, 'downloads/mcp.zip', mcpZip),
        'skill-zip': writeFixture(root, 'downloads/skill.zip', skillZip),
        'timeout-ms': 5000
      }
    );
    return { state, configFile, skillTarget, verified: verify(state.statePath) };
  } finally {
    os.homedir = originalHomedir;
  }
}

test('the Codex client resolves to the official user-level config and Skill root', () => {
  const targets = clientTargets(CODEX_MANIFEST);
  assert.equal(targets.name, 'codex');
  assert.equal(targets.format, 'toml');
  assert.equal(targets.mcpConfig, path.join(os.homedir(), '.codex', 'config.toml'));
  assert.equal(targets.mcpConfig, codexDefaultMcpConfig());
  assert.equal(targets.skillTarget, path.join(os.homedir(), '.agents', 'skills', SKILL_BASENAME));
  assert.equal(targets.skillTarget, codexDefaultSkillTarget());
});

test('Codex refuses path overrides and never reuses another Host directory', () => {
  const home = os.homedir();
  assert.throws(
    () => clientTargets(CODEX_MANIFEST, { 'mcp-config': path.join(home, '.workbuddy', 'mcp.json') }),
    error => error instanceof BootstrapError && error.code === 'INVALID_MCP_CONFIG'
  );
  const rejectedTargets = [
    path.join(home, '.workbuddy', 'skills', SKILL_BASENAME),
    path.join(home, '.cursor', 'skills', SKILL_BASENAME),
    path.join(home, 'custom', SKILL_BASENAME)
  ];
  for (const skillTarget of rejectedTargets) {
    assert.throws(
      () => clientTargets(CODEX_MANIFEST, { 'skill-target': skillTarget }),
      error => error instanceof BootstrapError && error.code === 'INVALID_SKILL_TARGET',
      skillTarget
    );
  }
});

test('Codex preflight reports an empty config as ready without creating it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-preflight-empty-'));
  const originalHomedir = os.homedir;
  os.homedir = () => root;
  try {
    const plan = preflight(CODEX_MANIFEST, { client: 'codex' });
    assert.equal(plan.ok, true);
    assert.equal(plan.status, 'READY');
    assert.equal(plan.client, 'codex');
    assert.equal(plan.configFormat, 'toml');
    assert.equal(plan.configExists, false);
    assert.deepEqual(plan.existingMcpEntries, []);
    assert.deepEqual(plan.unmanagedFuxiEntryKeys, []);
    assert.equal(plan.mcpConfig, path.join(root, '.codex', 'config.toml'));
    assert.equal(plan.skillTarget, path.join(root, '.agents', 'skills', SKILL_BASENAME));
    assert.equal(fs.existsSync(plan.mcpConfig), false);
  } finally {
    os.homedir = originalHomedir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex preflight preserves and reports unrelated configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-preflight-existing-'));
  const originalHomedir = os.homedir;
  os.homedir = () => root;
  try {
    const config = path.join(root, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config, CODEX_USER_CONFIG);
    const plan = preflight(CODEX_MANIFEST, { client: 'codex' });
    assert.equal(plan.configExists, true);
    assert.deepEqual(plan.existingMcpEntries, ['other']);
    assert.equal(fs.readFileSync(config, 'utf8'), CODEX_USER_CONFIG);
  } finally {
    os.homedir = originalHomedir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex preflight fails closed on malformed or unsupported TOML', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-preflight-bad-'));
  const originalHomedir = os.homedir;
  os.homedir = () => root;
  try {
    const config = path.join(root, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    const cases = [
      ['[mcp_servers.other]\ncommand = "node', 'MCP_CONFIG_INVALID'],
      ['[mcp_servers.other]\nargs = ["a",\n', 'MCP_CONFIG_INVALID'],
      ['mcp_servers = { other = { command = "node" } }\n', 'MCP_CONFIG_UNSUPPORTED'],
      ['[[mcp_servers]]\ncommand = "node"\n', 'MCP_CONFIG_UNSUPPORTED']
    ];
    for (const [content, code] of cases) {
      fs.writeFileSync(config, content);
      assert.throws(
        () => preflight(CODEX_MANIFEST, { client: 'codex' }),
        error => error instanceof BootstrapError && error.code === code && error.details.file === config,
        code + ' for ' + JSON.stringify(content)
      );
      assert.equal(fs.readFileSync(config, 'utf8'), content, 'a rejected config must stay untouched');
    }
  } finally {
    os.homedir = originalHomedir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a Codex install writes the official targets, preserves unrelated config and verifies', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-install-'));
  const home = path.join(root, 'home');
  try {
    const mcpZip = mcpPackageZip(root, VERIFIED_RESULT);
    const skillZip = skillPackageZip(root);
    const { state, configFile, skillTarget, verified } = await runCodexInstall({ root, home, mcpZip, skillZip });

    assert.equal(state.status, 'COMPLETE');
    assert.equal(state.client, 'codex');
    assert.equal(state.configFormat, 'toml');
    assert.equal(state.mcpConfig, configFile);
    assert.equal(state.skillTarget, skillTarget);
    assert.equal(state.mcpConnected, true);
    assert.equal(state.skillReady, true);
    assert.equal(state.reloadRequired, true);
    assert.equal(state.postReloadVerified, false);

    const written = fs.readFileSync(configFile, 'utf8');
    assert.equal(written.includes('approval_policy = "never"'), true);
    assert.equal(written.includes('sandbox = "elevated"'), true);
    assert.equal(written.includes('OTHER_FLAG = "1"'), true);
    assert.equal(written.includes('[[skills.config]]'), true);
    assert.equal(written.split('[mcp_servers.fuxi-platform]').length - 1, 1);

    const parsed = readConfigDocument(configFile, 'toml');
    assert.deepEqual(parsed.names, ['other', 'fuxi-platform']);
    const entry = parsed.servers['fuxi-platform'];
    assert.equal(entry.command, process.execPath);
    assert.deepEqual(entry.args, [path.join(state.mcpRoot, 'src', 'launcher.js')]);
    assert.equal(entry.env.FUXI_API_URL, 'http://127.0.0.1');
    assert.equal(entry.env.FUXI_SKILL_TARGET, skillTarget);
    assert.equal(entry.env.FUXI_INSTALL_ROOT, state.installRoot);
    assert.equal(entry.env.FUXI_CONNECT_CODE, undefined);
    assert.deepEqual(parsed.servers.other, { command: 'node', env: { OTHER_FLAG: '1' } });
    assert.deepEqual(parsed.unmanaged, [], 'a platform-written entry owns no user fields');

    assert.equal(fs.existsSync(path.join(skillTarget, 'SKILL.md')), true);
    assert.equal(verified.ok, true);
    assert.equal(verified.checks.config, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a repeated Codex install is idempotent and does not duplicate the entry', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-idempotent-'));
  const home = path.join(root, 'home');
  try {
    const mcpZip = mcpPackageZip(root, VERIFIED_RESULT);
    const skillZip = skillPackageZip(root);
    const first = await runCodexInstall({ root, home, mcpZip, skillZip });
    const afterFirst = fs.readFileSync(first.configFile, 'utf8');
    const second = await runCodexInstall({ root, home, mcpZip, skillZip, seedConfig: false });
    assert.equal(second.state.status, 'COMPLETE');
    assert.equal(second.state.reason, 'ALREADY_COMPLETE');
    assert.equal(second.verified.ok, true);
    const afterSecond = fs.readFileSync(first.configFile, 'utf8');
    assert.equal(afterSecond, afterFirst);
    assert.equal(afterSecond.split('[mcp_servers.fuxi-platform]').length - 1, 1);
    assert.equal(afterSecond.split('[mcp_servers.fuxi-platform.env]').length - 1, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a failed Codex install restores the previous config and removes the new Skill', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-rollback-'));
  const home = path.join(root, 'home');
  try {
    const configFile = path.join(home, '.codex', 'config.toml');
    const skillTarget = path.join(home, '.agents', 'skills', SKILL_BASENAME);
    const mcpZip = mcpPackageZip(root, { ok: false, authentication: 'none' });
    const skillZip = skillPackageZip(root);
    await assert.rejects(
      () => runCodexInstall({ root, home, mcpZip, skillZip }),
      error => error instanceof BootstrapError && error.code === 'MCP_CONNECTION_NOT_VERIFIED'
    );
    assert.equal(fs.readFileSync(configFile, 'utf8'), CODEX_USER_CONFIG, 'rollback must restore the prior Codex config');
    assert.equal(fs.existsSync(skillTarget), false, 'rollback must remove the unverified Skill');
    const failed = JSON.parse(fs.readFileSync(path.join(root, 'runtime', 'bootstrap-state.json'), 'utf8'));
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.failure.code, 'MCP_CONNECTION_NOT_VERIFIED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Windows Codex targets stay absolute and native', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-windows-'));
  const originalHomedir = os.homedir;
  os.homedir = () => root;
  try {
    const targets = clientTargets(CODEX_MANIFEST, { client: 'codex' });
    assert.equal(path.isAbsolute(targets.mcpConfig), true);
    assert.equal(path.isAbsolute(targets.skillTarget), true);
    assert.equal(path.basename(targets.mcpConfig), 'config.toml');
    if (process.platform === 'win32') {
      assert.equal(targets.mcpConfig, path.win32.join(root, '.codex', 'config.toml'));
      assert.equal(targets.skillTarget, path.win32.join(root, '.agents', 'skills', SKILL_BASENAME));
      assert.equal(path.win32.isAbsolute(targets.mcpConfig), true);
    }
  } finally {
    os.homedir = originalHomedir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('WorkBuddy and Cursor targets keep their existing JSON behaviour', () => {
  const workbuddy = clientTargets({ ...CODEX_MANIFEST, client: { name: 'workbuddy' } });
  assert.equal(workbuddy.name, 'workbuddy');
  assert.equal(workbuddy.format, 'json');
  assert.equal(workbuddy.mcpConfig, path.join(os.homedir(), '.workbuddy', 'mcp.json'));
  assert.equal(workbuddy.skillTarget, path.join(os.homedir(), '.workbuddy', 'skills', SKILL_BASENAME));

  const cursor = clientTargets({ ...CODEX_MANIFEST, client: { name: 'cursor' } });
  assert.equal(cursor.name, 'cursor');
  assert.equal(cursor.format, 'json');
  assert.equal(cursor.skillTarget, path.join(os.homedir(), '.cursor', 'skills', SKILL_BASENAME));
});

test('an existing .codex directory never triggers automatic Codex detection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-no-autodetect-'));
  const originalHomedir = os.homedir;
  const originalClient = process.env.FUXI_CLIENT;
  fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
  os.homedir = () => root;
  delete process.env.FUXI_CLIENT;
  try {
    assert.throws(
      () => clientTargets({ ...CODEX_MANIFEST, client: {} }),
      error => error instanceof BootstrapError && error.code === 'CLIENT_CONFIG_REQUIRED'
    );
  } finally {
    os.homedir = originalHomedir;
    if (originalClient === undefined) delete process.env.FUXI_CLIENT;
    else process.env.FUXI_CLIENT = originalClient;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// A user may hand-add supported Codex keys (startup_timeout_sec, env_vars) to the
// Fuxi entry. Preflight must report them, and a rewrite must fail closed rather
// than delete them; an already-complete install must stay a no-op.
test('user keys on the Fuxi entry are reported, never silently deleted', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-user-keys-'));
  const home = path.join(root, 'home');
  const originalHomedir = os.homedir;
  os.homedir = () => home;
  try {
    const configFile = path.join(home, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    const userAugmented = [
      'approval_policy = "never"',
      '',
      '[mcp_servers.fuxi-platform]',
      'command = "stale-node"',
      'args = ["/opt/stale/launcher.js"]',
      'startup_timeout_sec = 60',
      ''
    ].join('\n');
    fs.writeFileSync(configFile, userAugmented);

    const plan = preflight(CODEX_MANIFEST, { client: 'codex' });
    assert.deepEqual(plan.unmanagedFuxiEntryKeys, ['startup_timeout_sec']);
    assert.deepEqual(plan.existingMcpEntries, ['fuxi-platform']);
    assert.equal(fs.readFileSync(configFile, 'utf8'), userAugmented);

    // A rewrite is required here (stale command), so the install must stop with a
    // specific structured error instead of dropping the user key.
    const mcpZip = mcpPackageZip(root, VERIFIED_RESULT);
    const skillZip = skillPackageZip(root);
    await assert.rejects(
      () => runCodexInstall({ root, home, mcpZip, skillZip, seedConfig: false }),
      error => {
        assert.ok(error instanceof BootstrapError, 'expected BootstrapError, got ' + error);
        assert.equal(error.code, 'MCP_CONFIG_UNSUPPORTED');
        assert.equal(error.details.file, configFile);
        assert.deepEqual(error.details.unmanaged, ['startup_timeout_sec']);
        return true;
      }
    );
    assert.equal(fs.readFileSync(configFile, 'utf8'), userAugmented, 'the user key must survive a refused install');
  } finally {
    os.homedir = originalHomedir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an already-complete Codex install stays a no-op even with a user key present', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-user-keys-noop-'));
  const home = path.join(root, 'home');
  try {
    const mcpZip = mcpPackageZip(root, VERIFIED_RESULT);
    const skillZip = skillPackageZip(root);
    const first = await runCodexInstall({ root, home, mcpZip, skillZip });

    // Add a user key after the successful install, then reinstall.
    const augmented = fs.readFileSync(first.configFile, 'utf8')
      .replace('[mcp_servers.fuxi-platform]\n', '[mcp_servers.fuxi-platform]\nstartup_timeout_sec = 60\n');
    fs.writeFileSync(first.configFile, augmented);

    const second = await runCodexInstall({ root, home, mcpZip, skillZip, seedConfig: false });
    assert.equal(second.state.status, 'COMPLETE');
    assert.equal(second.state.reason, 'ALREADY_COMPLETE');
    assert.equal(fs.readFileSync(first.configFile, 'utf8'), augmented, 'a no-op install must not rewrite the config');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- Gap 1: env 里非伏羲管理的用户变量（安装器层面） ----

test('the installer only writes env keys declared as Fuxi-managed', () => {
  // 白名单必须覆盖安装器实际写出的每一个 env 键，否则我们自己的键会被判成用户资产。
  const plain = mcpEntry({ apiUrl: 'http://127.0.0.1:3001' }, '/opt/mcp', '/opt/skill', '/opt/creds', '/opt/root', null);
  const withConnect = mcpEntry({ apiUrl: 'http://127.0.0.1:3001' }, '/opt/mcp', '/opt/skill', '/opt/creds', '/opt/root', 'connect-code');
  for (const entry of [plain, withConnect]) {
    for (const key of Object.keys(entry.env)) {
      assert.equal(FUXI_MANAGED_ENV_KEYS.includes(key), true, key + ' must be declared as Fuxi-managed');
    }
  }
  assert.equal(Object.keys(withConnect.env).includes('FUXI_CONNECT_CODE'), true);
  assert.equal(FUXI_MANAGED_ENV_KEYS.includes('FUXI_CONNECT_CODE'), true);
});

function userEnvConfig(extraEnvLines) {
  return [
    'approval_policy = "never"',
    '',
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    'args = ["/opt/stale/launcher.js"]',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'FUXI_API_URL = "http://stale.invalid"',
    ...extraEnvLines,
    ''
  ].join('\n');
}

test('Codex preflight reports user env vars on the Fuxi entry without touching the file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-env-preflight-'));
  const originalHomedir = os.homedir;
  os.homedir = () => root;
  try {
    const config = path.join(root, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    const content = userEnvConfig(['NODE_OPTIONS = "--max-old-space-size=4096"', 'HTTP_PROXY = "http://proxy.invalid:8080"']);
    fs.writeFileSync(config, content);
    const plan = preflight(CODEX_MANIFEST, { client: 'codex' });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.unmanagedFuxiEnvKeys, ['NODE_OPTIONS', 'HTTP_PROXY']);
    assert.deepEqual(plan.unmanagedFuxiEntryKeys, [
      'mcp_servers.fuxi-platform.env.NODE_OPTIONS',
      'mcp_servers.fuxi-platform.env.HTTP_PROXY'
    ]);
    assert.equal(fs.readFileSync(config, 'utf8'), content, 'preflight must not modify the config');
  } finally {
    os.homedir = originalHomedir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a required Codex rewrite fails closed when the Fuxi entry has user env vars', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-env-blocked-'));
  const home = path.join(root, 'home');
  try {
    const configFile = path.join(home, '.codex', 'config.toml');
    const skillTarget = path.join(home, '.agents', 'skills', SKILL_BASENAME);
    const userConfig = userEnvConfig(['NODE_OPTIONS = "--max-old-space-size=4096"']);
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, userConfig);
    const mcpZip = mcpPackageZip(root, VERIFIED_RESULT);
    const skillZip = skillPackageZip(root);
    await assert.rejects(
      () => runCodexInstall({ root, home, mcpZip, skillZip, seedConfig: false }),
      error => {
        assert.ok(error instanceof BootstrapError, 'expected BootstrapError, got ' + error);
        assert.equal(error.code, 'MCP_CONFIG_UNSUPPORTED');
        assert.equal(error.details.file, configFile);
        assert.deepEqual(error.details.unmanagedEnvKeys, ['NODE_OPTIONS']);
        return true;
      }
    );
    assert.equal(fs.readFileSync(configFile, 'utf8'), userConfig, 'the user env var must survive a refused install');
    assert.equal(fs.existsSync(skillTarget), false, 'rollback must remove the unverified Skill');
    const failed = JSON.parse(fs.readFileSync(path.join(root, 'runtime', 'bootstrap-state.json'), 'utf8'));
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.failure.code, 'MCP_CONFIG_UNSUPPORTED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an already-complete Codex install is a no-op even with user env vars on the entry', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-env-noop-'));
  const home = path.join(root, 'home');
  try {
    const mcpZip = mcpPackageZip(root, VERIFIED_RESULT);
    const skillZip = skillPackageZip(root);
    const first = await runCodexInstall({ root, home, mcpZip, skillZip });
    // 用户随后往伏羲条目的 env 里加了变量：已装完的接入必须保持空操作。
    const augmented = fs.readFileSync(first.configFile, 'utf8').replace(
      '[mcp_servers.fuxi-platform.env]\n',
      '[mcp_servers.fuxi-platform.env]\nNODE_OPTIONS = "--max-old-space-size=4096"\n'
    );
    fs.writeFileSync(first.configFile, augmented);
    const second = await runCodexInstall({ root, home, mcpZip, skillZip, seedConfig: false });
    assert.equal(second.state.status, 'COMPLETE');
    assert.equal(second.state.reason, 'ALREADY_COMPLETE');
    assert.equal(second.verified.ok, true);
    assert.equal(fs.readFileSync(first.configFile, 'utf8'), augmented, 'a no-op install must not rewrite the config');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a required Codex rewrite fails closed when the Fuxi block holds a user comment', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-codex-comment-blocked-'));
  const home = path.join(root, 'home');
  try {
    const configFile = path.join(home, '.codex', 'config.toml');
    const userConfig = [
      'approval_policy = "never"',
      '',
      '[mcp_servers.fuxi-platform]',
      '# 由伏羲平台接管，请勿手改',
      'command = "stale-node"',
      'args = ["/opt/stale/launcher.js"]',
      ''
    ].join('\n');
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, userConfig);
    const mcpZip = mcpPackageZip(root, VERIFIED_RESULT);
    const skillZip = skillPackageZip(root);
    await assert.rejects(
      () => runCodexInstall({ root, home, mcpZip, skillZip, seedConfig: false }),
      error => {
        assert.ok(error instanceof BootstrapError, 'expected BootstrapError, got ' + error);
        assert.equal(error.code, 'MCP_CONFIG_UNSUPPORTED');
        assert.equal(error.details.commentLines.length, 1);
        return true;
      }
    );
    assert.equal(fs.readFileSync(configFile, 'utf8'), userConfig, 'the user comment must survive a refused install');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
