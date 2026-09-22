'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { TomlError, readMcpServers, upsertMcpServer } = require('../src/fuxi-toml');

// Windows paths come from path.win32 and expected output from JSON.stringify so
// the fixtures never depend on hand-written backslash escaping.
const WIN = (...parts) => path.win32.join(...parts);
const BSLASH = String.fromCharCode(92);
const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);

const FUXI_ENTRY = {
  command: WIN('C:', 'Program Files', 'nodejs', 'node.exe'),
  args: [WIN('C:', 'Users', 'tester', '.fuxi', 'agent-runtime', 'bootstrap-mcp', 'fuxi-platform-mcp', 'src', 'launcher.js')],
  env: {
    FUXI_API_URL: 'http://127.0.0.1:3001',
    FUXI_CREDENTIALS_FILE: WIN('C:', 'Users', 'tester', '.fuxi', 'mcp-credentials.json'),
    FUXI_SKILL_TARGET: WIN('C:', 'Users', 'tester', '.agents', 'skills', 'fuxi-prototype')
  }
};

// A realistic Codex user config: unrelated top-level settings, unrelated MCP
// servers (one with an .env sub-table) and an array-of-tables block.
const CODEX_FIXTURE = [
  'approval_policy = "never"',
  'model = "gpt-5.6-codex"',
  '',
  '[windows]',
  'sandbox = "elevated"',
  '',
  '[mcp_servers.pencil]',
  'command = "node"',
  'args = ["pencil.js", "--stdio"]',
  '',
  '[mcp_servers.node_repl]',
  'command = "node"',
  '',
  '  [mcp_servers.node_repl.env]',
  '  NODE_OPTIONS = "--max-old-space-size=4096"',
  '',
  '[[skills.config]]',
  'name = "neat-freak"',
  ''
].join('\n');

function assertTomlError(error, code) {
  assert.ok(error instanceof TomlError, 'expected a TomlError, received ' + error);
  assert.equal(error.code, code);
  return true;
}

test('an empty Codex config receives one canonical fuxi-platform entry', () => {
  const written = upsertMcpServer('', 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  assert.equal(written.text.endsWith('\n'), true);
  const parsed = readMcpServers(written.text);
  assert.deepEqual(parsed.names, ['fuxi-platform']);
  assert.deepEqual(parsed.servers['fuxi-platform'], FUXI_ENTRY);
});

test('Windows paths are written as escaped TOML strings and round-trip exactly', () => {
  const written = upsertMcpServer('', 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.text.includes('command = ' + JSON.stringify(FUXI_ENTRY.command)), true);
  assert.equal(written.text.includes('args = ' + JSON.stringify(FUXI_ENTRY.args)), true);
  assert.equal(written.text.includes(FUXI_ENTRY.command), false, 'raw backslash path must not appear unescaped');
  assert.equal(written.text.includes('FUXI_CREDENTIALS_FILE = ' + JSON.stringify(FUXI_ENTRY.env.FUXI_CREDENTIALS_FILE)), true);
  assert.deepEqual(readMcpServers(written.text).servers['fuxi-platform'], FUXI_ENTRY);
});

test('unrelated Codex settings, servers and skill config survive the merge', () => {
  const written = upsertMcpServer(CODEX_FIXTURE, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  for (const line of ['approval_policy = "never"', 'model = "gpt-5.6-codex"', '[windows]', 'sandbox = "elevated"',
    '[mcp_servers.pencil]', 'args = ["pencil.js", "--stdio"]', '[mcp_servers.node_repl.env]',
    '  NODE_OPTIONS = "--max-old-space-size=4096"', '[[skills.config]]', 'name = "neat-freak"']) {
    assert.equal(written.text.includes(line), true, 'missing preserved line: ' + line);
  }
  // The fixture has no mcp_servers table of its own, so the entry is appended.
  assert.equal(written.text.startsWith(CODEX_FIXTURE), true);
  const parsed = readMcpServers(written.text);
  assert.deepEqual(parsed.names, ['pencil', 'node_repl', 'fuxi-platform']);
  assert.deepEqual(parsed.servers.pencil, { command: 'node', args: ['pencil.js', '--stdio'] });
  assert.deepEqual(parsed.servers.node_repl, { command: 'node', env: { NODE_OPTIONS: '--max-old-space-size=4096' } });
});

test('an existing Fuxi entry is replaced in place without duplication', () => {
  const existing = [
    '[mcp_servers.alpha]',
    'command = "alpha"',
    '',
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    'args = ["/opt/stale/launcher.js"]',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'FUXI_API_URL = "http://stale.invalid"',
    '',
    '[mcp_servers.zeta]',
    'command = "zeta"',
    ''
  ].join('\n');
  const written = upsertMcpServer(existing, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  assert.equal(written.text.split('[mcp_servers.fuxi-platform]').length - 1, 1);
  assert.equal(written.text.split('[mcp_servers.fuxi-platform.env]').length - 1, 1);
  assert.equal(written.text.includes('stale-node'), false);
  assert.equal(written.text.includes('http://stale.invalid'), false);
  assert.equal(written.text.includes('[mcp_servers.alpha]\ncommand = "alpha"'), true);
  assert.equal(written.text.includes('[mcp_servers.zeta]\ncommand = "zeta"'), true);
  const parsed = readMcpServers(written.text);
  assert.deepEqual(parsed.names, ['alpha', 'fuxi-platform', 'zeta']);
  assert.deepEqual(parsed.servers['fuxi-platform'], FUXI_ENTRY);
});

test('repeated upserts are byte-for-byte idempotent', () => {
  const first = upsertMcpServer(CODEX_FIXTURE, 'fuxi-platform', FUXI_ENTRY);
  const second = upsertMcpServer(first.text, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(second.changed, false);
  assert.equal(second.text, first.text);
  const third = upsertMcpServer(second.text, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(third.changed, false);
  assert.equal(third.text, first.text);
});

test('malformed TOML fails closed with TOML_INVALID', () => {
  const fixtures = {
    'unterminated string': '[mcp_servers.x]\ncommand = "node',
    'unterminated array': '[mcp_servers.x]\nargs = ["a", "b"',
    'unterminated table header': '[mcp_servers.x\ncommand = "node"\n',
    'duplicate key': '[mcp_servers.x]\ncommand = "a"\ncommand = "b"\n',
    'duplicate table': '[mcp_servers.x]\ncommand = "a"\n[mcp_servers.x]\ncommand = "b"\n',
    'malformed value': '[mcp_servers.x]\ncommand = node\n',
    'missing equals': '[mcp_servers.x]\ncommand "node"\n',
    'trailing garbage': '[mcp_servers.x]\ncommand = "node" "extra"\n'
  };
  for (const [label, fixture] of Object.entries(fixtures)) {
    assert.throws(() => readMcpServers(fixture), error => assertTomlError(error, 'TOML_INVALID'), label);
    assert.throws(() => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY), error => assertTomlError(error, 'TOML_INVALID'), label);
  }
});

test('unsupported mcp_servers representations fail closed instead of being rewritten', () => {
  const fixtures = {
    'root inline table': 'mcp_servers = { x = { command = "node" } }\n',
    'root dotted key': 'mcp_servers.x.command = "node"\n',
    'array of tables': '[[mcp_servers]]\ncommand = "node"\n',
    'keys inside the container table': '[mcp_servers]\nx = { command = "node" }\n'
  };
  for (const [label, fixture] of Object.entries(fixtures)) {
    assert.throws(() => readMcpServers(fixture), error => assertTomlError(error, 'TOML_UNSUPPORTED'), label);
    assert.throws(() => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY), error => assertTomlError(error, 'TOML_UNSUPPORTED'), label);
  }
});

test('a non-contiguous Fuxi entry stays readable but is never rewritten', () => {
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    'command = "a"',
    '',
    '[mcp_servers.between]',
    'command = "b"',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'FUXI_API_URL = "http://x.invalid"',
    ''
  ].join('\n');
  const parsed = readMcpServers(fixture);
  assert.deepEqual(parsed.servers['fuxi-platform'], { command: 'a', env: { FUXI_API_URL: 'http://x.invalid' } });
  assert.deepEqual(parsed.servers.between, { command: 'b' });
  assert.throws(
    () => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY),
    error => assertTomlError(error, 'TOML_UNSUPPORTED')
  );
});

test('reformatted entries with multi-line arrays and inline env tables are read back', () => {
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    'args = [',
    '  "/opt/fuxi/launcher.js",   # launcher',
    '  "--flag",',
    ']',
    'env = { FUXI_API_URL = "http://127.0.0.1:3001", ' + SQ + 'FUXI_INSTALL_ROOT' + SQ + ' = ' + SQ + '/opt/fuxi/agent-runtime' + SQ + ' }',
    '',
    '[mcp_servers.other]',
    'command = "other"',
    ''
  ].join('\n');
  const parsed = readMcpServers(fixture);
  assert.deepEqual(parsed.names, ['fuxi-platform', 'other']);
  assert.deepEqual(parsed.servers['fuxi-platform'], {
    command: 'node',
    args: ['/opt/fuxi/launcher.js', '--flag'],
    env: { FUXI_API_URL: 'http://127.0.0.1:3001', FUXI_INSTALL_ROOT: '/opt/fuxi/agent-runtime' }
  });
});

test('CRLF line endings and a UTF-8 BOM are preserved', () => {
  const fixture = '\ufeffapproval_policy = "never"\r\n\r\n[mcp_servers.other]\r\ncommand = "other"\r\n';
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.text.charCodeAt(0), 0xfeff);
  assert.equal(written.text.includes('\r\n[mcp_servers.fuxi-platform]\r\ncommand = '), true);
  assert.equal(/\n/.test(written.text.replace(/\r\n/g, '')), false, 'no bare LF may be introduced');
  assert.deepEqual(readMcpServers(written.text).names, ['other', 'fuxi-platform']);
  assert.equal(upsertMcpServer(written.text, 'fuxi-platform', FUXI_ENTRY).changed, false);
});

test('settings that follow the Fuxi entry stay untouched', () => {
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    'command = "old"',
    '',
    '[features]',
    'web_search = true',
    '',
    '[[skills.config]]',
    'name = "archify"',
    ''
  ].join('\n');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.text.includes('[features]\nweb_search = true'), true);
  assert.equal(written.text.includes('[[skills.config]]\nname = "archify"'), true);
  assert.equal(written.text.includes('command = "old"'), false);
});

// 真实 Codex 配置里 mcp server 还会出现 env_vars / startup_timeout_sec 等字段
// （本机 ~/.codex/config.toml 的 node_repl 即如此）。用户若把这些字段加到伏羲条目上，
// 重写必须 fail closed，不能静默删除。
test('user-managed keys inside the Fuxi entry block a rewrite instead of being dropped', () => {
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    'startup_timeout_sec = 60',
    'env_vars = ["PATH"]',
    ''
  ].join('\n');
  const parsed = readMcpServers(fixture);
  assert.deepEqual(parsed.unmanaged['fuxi-platform'], ['startup_timeout_sec', 'env_vars']);
  assert.throws(
    () => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY),
    error => {
      assertTomlError(error, 'TOML_UNSUPPORTED');
      assert.deepEqual(error.details.unmanaged, ['startup_timeout_sec', 'env_vars']);
      assert.equal(error.details.server, 'fuxi-platform');
      return true;
    }
  );
});

test('a user sub-table under the Fuxi entry blocks a rewrite instead of being dropped', () => {
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    '',
    '[mcp_servers.fuxi-platform.metadata]',
    'owner = "platform"',
    ''
  ].join('\n');
  assert.deepEqual(readMcpServers(fixture).unmanaged['fuxi-platform'], ['mcp_servers.fuxi-platform.metadata']);
  assert.throws(
    () => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY),
    error => assertTomlError(error, 'TOML_UNSUPPORTED')
  );
});

test('entries without user-managed keys report no unmanaged content', () => {
  const parsed = readMcpServers(CODEX_FIXTURE);
  assert.deepEqual(parsed.unmanaged, {});
  const written = upsertMcpServer(CODEX_FIXTURE, 'fuxi-platform', FUXI_ENTRY);
  assert.deepEqual(readMcpServers(written.text).unmanaged, {});
});

test('comments between the Fuxi entry and the next table are preserved', () => {
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    'command = "old"',
    '',
    '# keep this note',
    '',
    '[features]',
    'web_search = true',
    ''
  ].join('\n');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.text.includes('# keep this note'), true);
  assert.equal(written.text.includes('[features]\nweb_search = true'), true);
  const second = upsertMcpServer(written.text, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(second.changed, false);
  assert.equal(second.text, written.text);
});

test('basic-string escapes are decoded and re-encoded without loss', () => {
  const windowsPath = WIN('C:', 'runtimes', 'node.exe');
  const escaped = JSON.stringify(windowsPath); // TOML basic string == JSON escaping here
  const fixture = '[mcp_servers.other]\ncommand = ' + escaped + '\n';
  assert.equal(readMcpServers(fixture).servers.other.command, windowsPath);
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.deepEqual(readMcpServers(written.text).servers.other, { command: windowsPath });
  // A malformed escape sequence inside a basic string is rejected, not guessed.
  assert.throws(
    () => readMcpServers('[mcp_servers.other]\ncommand = "' + BSLASH + 'users' + BSLASH + 'tester"\n'),
    error => assertTomlError(error, 'TOML_INVALID')
  );
});

test('a Codex config shaped like a real user profile round-trips', () => {
  // Shape taken from a real Windows Codex config: root scalars, dotted and quoted
  // project keys, nested tables, array-of-tables, plus servers that carry an env
  // sub-table and the extra Codex keys env_vars / startup_timeout_sec.
  const projectBasic = '[projects.' + DQ + 'c:' + BSLASH + BSLASH + 'users' + BSLASH + BSLASH + 'tester' + DQ + ']';
  const projectLiteral = '[projects.' + SQ + 'd:' + BSLASH + 'work' + BSLASH + 'app' + SQ + ']';
  const nodeCommand = 'C:' + BSLASH + 'runtimes' + BSLASH + 'node.exe';
  const codexHome = 'C:' + BSLASH + 'Users' + BSLASH + 'tester' + BSLASH + '.codex';
  const fixtureLines = [
    'approval_policy = "never"',
    'model_provider = "custom"',
    '',
    projectBasic,
    'trust_level = "trusted"',
    '',
    projectLiteral,
    'trust_level = "trusted"',
    '',
    '[windows]',
    'sandbox = "elevated"',
    '',
    '[mcp_servers.node_repl]',
    'command = ' + JSON.stringify(nodeCommand),
    'args = []',
    'startup_timeout_sec = 30',
    'env_vars = ["PATH", "HOME"]',
    '',
    '[mcp_servers.node_repl.env]',
    'CODEX_HOME = ' + JSON.stringify(codexHome),
    '',
    '[[skills.config]]',
    'name = "neat-freak"',
    '',
    '[[skills.config]]',
    'name = "archify"',
    '',
    '[shell_environment_policy.set]',
    'FOO = "bar"',
    ''
  ];
  const fixture = fixtureLines.join('\n');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  // Stronger than enumerating lines: every unrelated line must survive verbatim.
  for (const line of fixture.split('\n')) {
    if (!line.trim()) continue;
    assert.equal(written.text.includes(line), true, 'unrelated line was lost: ' + line);
  }
  for (const line of [projectBasic, projectLiteral, 'startup_timeout_sec = 30', 'env_vars = ["PATH", "HOME"]',
    'CODEX_HOME = ' + JSON.stringify(codexHome), '[shell_environment_policy.set]', 'FOO = "bar"']) {
    assert.equal(written.text.includes(line), true, 'missing preserved line: ' + line);
  }
  assert.equal(written.text.split('[[skills.config]]').length - 1, 2);
  // Unrelated servers keep their extra keys and stay listed.
  const parsed = readMcpServers(written.text);
  assert.deepEqual(parsed.names, ['node_repl', 'fuxi-platform']);
  assert.equal(parsed.servers.node_repl.command, nodeCommand);
  assert.equal(parsed.servers.node_repl.env.CODEX_HOME, codexHome);
  assert.deepEqual(parsed.servers['fuxi-platform'], FUXI_ENTRY);
  assert.equal(upsertMcpServer(written.text, 'fuxi-platform', FUXI_ENTRY).changed, false);
});
