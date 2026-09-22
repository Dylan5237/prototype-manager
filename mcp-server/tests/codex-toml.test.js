'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { TomlError, FUXI_MANAGED_ENV_KEYS, readMcpServers, upsertMcpServer } = require('../src/fuxi-toml');

// 用户手加到伏羲条目 env 上的变量：不是我们的，重写会丢，必须被检出。
const USER_ENV_FIXTURE = [
  '[mcp_servers.fuxi-platform]',
  'command = "stale-node"',
  'args = ["/opt/stale/launcher.js"]',
  '',
  '[mcp_servers.fuxi-platform.env]',
  'FUXI_API_URL = "http://stale.invalid"',
  'NODE_OPTIONS = "--max-old-space-size=4096"',
  'HTTP_PROXY = "http://proxy.invalid:8080"',
  ''
].join('\n');

// 同样的用户变量，写在内联 env 表里。
const USER_INLINE_ENV_FIXTURE = [
  '[mcp_servers.fuxi-platform]',
  'command = "stale-node"',
  'args = ["/opt/stale/launcher.js"]',
  'env = { FUXI_API_URL = "http://stale.invalid", NODE_OPTIONS = "--max-old-space-size=4096" }',
  ''
].join('\n');

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

test('a platform-written entry reports no unmanaged content, while user env vars do', () => {
  // 平台自己写出来的伏羲条目只含受管理内容。
  const written = upsertMcpServer(CODEX_FIXTURE, 'fuxi-platform', FUXI_ENTRY);
  const parsed = readMcpServers(written.text);
  assert.equal(parsed.unmanaged['fuxi-platform'], undefined);
  assert.equal(parsed.unmanagedEnv['fuxi-platform'], undefined);
  // 同一份配置里，无关 server 的 env 子表带着用户变量，仍必须被识别为未管理内容
  // （CODEX_FIXTURE 的 node_repl.env 里就是 NODE_OPTIONS）。
  const fixture = readMcpServers(CODEX_FIXTURE);
  assert.deepEqual(fixture.unmanagedEnv, { node_repl: ['NODE_OPTIONS'] });
  assert.deepEqual(fixture.unmanaged, { node_repl: ['mcp_servers.node_repl.env.NODE_OPTIONS'] });
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

// ---- Gap 1: env 里非伏羲管理的用户变量 ----

test('the managed env whitelist covers the installer keys and nothing more', () => {
  // 白名单必须恰好是安装器写进去的那几个 FUXI_* 键；多写会掩盖用户变量，少写会误报。
  assert.deepEqual([...FUXI_MANAGED_ENV_KEYS].sort(), [
    'FUXI_API_URL', 'FUXI_CONNECT_CODE', 'FUXI_CREDENTIALS_FILE',
    'FUXI_INSTALL_ROOT', 'FUXI_MCP_TARGET', 'FUXI_SKILL_TARGET'
  ]);
  const whitelisted = [
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    '',
    '[mcp_servers.fuxi-platform.env]',
    ...FUXI_MANAGED_ENV_KEYS.map(key => key + ' = "value"'),
    ''
  ].join('\n');
  assert.deepEqual(readMcpServers(whitelisted).unmanagedEnv, {});
  assert.deepEqual(readMcpServers(whitelisted).unmanaged, {});
});

test('user env vars in the [env] sub-table block a rewrite instead of being dropped', () => {
  const parsed = readMcpServers(USER_ENV_FIXTURE);
  assert.deepEqual(parsed.unmanagedEnv['fuxi-platform'], ['NODE_OPTIONS', 'HTTP_PROXY']);
  assert.deepEqual(parsed.unmanaged['fuxi-platform'], [
    'mcp_servers.fuxi-platform.env.NODE_OPTIONS',
    'mcp_servers.fuxi-platform.env.HTTP_PROXY'
  ]);
  // 用户变量本身仍然可读，只是不允许在重写时被丢掉。
  assert.equal(parsed.servers['fuxi-platform'].env.NODE_OPTIONS, '--max-old-space-size=4096');
  assert.equal(parsed.servers['fuxi-platform'].env.HTTP_PROXY, 'http://proxy.invalid:8080');
  assert.throws(
    () => upsertMcpServer(USER_ENV_FIXTURE, 'fuxi-platform', FUXI_ENTRY),
    error => {
      assertTomlError(error, 'TOML_UNSUPPORTED');
      assert.deepEqual(error.details.unmanagedEnvKeys, ['NODE_OPTIONS', 'HTTP_PROXY']);
      assert.equal(error.details.server, 'fuxi-platform');
      assert.deepEqual(error.details.commentLines, []);
      return true;
    }
  );
});

test('user env vars in an inline env table block a rewrite instead of being dropped', () => {
  const parsed = readMcpServers(USER_INLINE_ENV_FIXTURE);
  assert.deepEqual(parsed.unmanagedEnv['fuxi-platform'], ['NODE_OPTIONS']);
  assert.deepEqual(parsed.unmanaged['fuxi-platform'], ['mcp_servers.fuxi-platform.env.NODE_OPTIONS']);
  assert.equal(parsed.servers['fuxi-platform'].env.NODE_OPTIONS, '--max-old-space-size=4096');
  assert.throws(
    () => upsertMcpServer(USER_INLINE_ENV_FIXTURE, 'fuxi-platform', FUXI_ENTRY),
    error => {
      assertTomlError(error, 'TOML_UNSUPPORTED');
      assert.deepEqual(error.details.unmanagedEnvKeys, ['NODE_OPTIONS']);
      return true;
    }
  );
});

test('user env vars written as dotted env keys block a rewrite too', () => {
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    'env.FUXI_API_URL = "http://stale.invalid"',
    'env.HTTP_PROXY = "http://proxy.invalid:8080"',
    ''
  ].join('\n');
  const parsed = readMcpServers(fixture);
  assert.deepEqual(parsed.unmanagedEnv['fuxi-platform'], ['HTTP_PROXY']);
  assert.equal(parsed.servers['fuxi-platform'].env.HTTP_PROXY, 'http://proxy.invalid:8080');
  assert.throws(
    () => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY),
    error => {
      assertTomlError(error, 'TOML_UNSUPPORTED');
      assert.deepEqual(error.details.unmanagedEnvKeys, ['HTTP_PROXY']);
      return true;
    }
  );
});

// ---- Gap 1 + 2: 已匹配时必须空操作 ----

// 把 FUXI_ENTRY 的受管理内容写成文件，再附上用户自己加的东西。
function matchingFile({ extraEnv = [], extraLines = [] } = {}) {
  return [
    '[mcp_servers.fuxi-platform]',
    'command = ' + JSON.stringify(FUXI_ENTRY.command),
    'args = ' + JSON.stringify(FUXI_ENTRY.args),
    ...extraLines,
    '',
    '[mcp_servers.fuxi-platform.env]',
    ...Object.entries(FUXI_ENTRY.env).map(([key, value]) => key + ' = ' + JSON.stringify(value)),
    ...extraEnv,
    ''
  ].join('\n');
}

test('a matching entry with user env vars is left byte-for-byte unchanged', () => {
  const fixture = matchingFile({ extraEnv: ['NODE_OPTIONS = "--max-old-space-size=4096"', 'HTTP_PROXY = "http://proxy.invalid:8080"'] });
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, false);
  assert.equal(written.text, fixture);
  // 用户变量仍在读数里，且被如实标为未管理。
  const parsed = readMcpServers(written.text);
  assert.equal(parsed.servers['fuxi-platform'].env.NODE_OPTIONS, '--max-old-space-size=4096');
  assert.deepEqual(parsed.unmanagedEnv['fuxi-platform'], ['NODE_OPTIONS', 'HTTP_PROXY']);
});

test('a change in our own managed value still forces the rewrite path', () => {
  // 同一个文件，只把伏羲自己的 FUXI_API_URL 改掉：这时才需要重写，用户变量就会阻塞。
  const fixture = matchingFile({ extraEnv: ['NODE_OPTIONS = "--max-old-space-size=4096"'] });
  assert.throws(
    () => upsertMcpServer(fixture, 'fuxi-platform', { ...FUXI_ENTRY, env: { ...FUXI_ENTRY.env, FUXI_API_URL: 'http://changed.invalid' } }),
    error => {
      assertTomlError(error, 'TOML_UNSUPPORTED');
      assert.deepEqual(error.details.unmanagedEnvKeys, ['NODE_OPTIONS']);
      return true;
    }
  );
});

// ---- Gap 2: 块内用户注释 ----

const INNER_COMMENT_FORMS = {
  'before the first assignment': [
    '[mcp_servers.fuxi-platform]',
    '# 这里的地址请勿改动',
    'command = "stale-node"',
    'args = ["/opt/stale/launcher.js"]',
    ''
  ],
  'between two assignments': [
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    '# 由平台接管，勿手动编辑',
    'args = ["/opt/stale/launcher.js"]',
    ''
  ],
  'at the end of the last assignment line': [
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    'args = ["/opt/stale/launcher.js"] # 行尾说明',
    ''
  ],
  'before an env sub-table key': [
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    '',
    '[mcp_servers.fuxi-platform.env]',
    '# 环境变量说明',
    'FUXI_API_URL = "http://stale.invalid"',
    ''
  ]
};

test('comments inside the Fuxi block block a rewrite instead of being dropped', () => {
  for (const [label, lines] of Object.entries(INNER_COMMENT_FORMS)) {
    const fixture = lines.join('\n');
    assert.throws(
      () => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY),
      error => {
        assertTomlError(error, 'TOML_UNSUPPORTED');
        assert.equal(error.details.commentLines.length > 0, true, label + ': expected comment lines');
        assert.equal(error.details.server, 'fuxi-platform');
        return true;
      },
      label
    );
  }
});

test('a matching entry with an inner comment is left byte-for-byte unchanged', () => {
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    '# 平台接管此条目',
    'command = ' + JSON.stringify(FUXI_ENTRY.command),
    'args = ' + JSON.stringify(FUXI_ENTRY.args),
    '',
    '[mcp_servers.fuxi-platform.env]',
    ...Object.entries(FUXI_ENTRY.env).map(([key, value]) => key + ' = ' + JSON.stringify(value)),
    ''
  ].join('\n');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, false);
  assert.equal(written.text, fixture);
  assert.equal(written.text.includes('# 平台接管此条目'), true);
});

test('a comment after the block is not a blocker and survives a required rewrite', () => {
  // 末尾到下一个表头之间的注释不在替换区间内，属于可保留内容，不应阻塞重写。
  const fixture = [
    '[mcp_servers.fuxi-platform]',
    'command = "stale-node"',
    'args = ["/opt/stale/launcher.js"]',
    '',
    '# 以下为本地其它配置',
    '',
    '[features]',
    'web_search = true',
    ''
  ].join('\n');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  assert.equal(written.text.includes('# 以下为本地其它配置'), true);
  assert.equal(written.text.includes('[features]\nweb_search = true'), true);
  assert.deepEqual(readMcpServers(written.text).servers['fuxi-platform'], FUXI_ENTRY);
  assert.equal(upsertMcpServer(written.text, 'fuxi-platform', FUXI_ENTRY).changed, false);
});

// ---- 注释探测的边界：既不能漏（丢注释），也不能误报（把 # 当注释） ----

test('a # inside a string is not a comment and does not block a rewrite', () => {
  const fixture = '[mcp_servers.other]\ncommand = "C:/a#b/node.exe"\nurl = "http://x/#frag"\n';
  assert.equal(readMcpServers(fixture).servers.other.command, 'C:/a#b/node.exe');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  assert.equal(written.text.includes('command = "C:/a#b/node.exe"'), true);
  assert.equal(written.text.includes('url = "http://x/#frag"'), true);
});

test('a comment inside a multi-line array blocks a rewrite', () => {
  // 数组里的注释位于被替换区间，规范化重写会丢掉它，因此必须 fail closed。
  const fixture = ['[mcp_servers.fuxi-platform]', 'command = "stale"', 'args = [', '  "/opt/x.js",  # launcher', ']', ''].join('\n');
  assert.throws(
    () => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY),
    error => {
      assertTomlError(error, 'TOML_UNSUPPORTED');
      assert.deepEqual(error.details.commentLines, [4]);
      return true;
    }
  );
});

test('a reformatted multi-line array without comments is normalised and stays idempotent', () => {
  const fixture = ['[mcp_servers.fuxi-platform]', 'command = "stale"', 'args = [', '  "/opt/x.js",', ']', ''].join('\n');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  assert.equal(upsertMcpServer(written.text, 'fuxi-platform', FUXI_ENTRY).changed, false);
  assert.deepEqual(readMcpServers(written.text).servers['fuxi-platform'], FUXI_ENTRY);
});

test('inner comments are detected under a BOM and CRLF line endings', () => {
  const fixture = '\ufeff[mcp_servers.fuxi-platform]\r\n# boom\r\ncommand = "stale"\r\n';
  assert.throws(
    () => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY),
    error => {
      assertTomlError(error, 'TOML_UNSUPPORTED');
      assert.deepEqual(error.details.commentLines, [2]);
      return true;
    }
  );
});

test('an outside comment written directly above the next table stays put', () => {
  const fixture = ['[mcp_servers.fuxi-platform]', 'command = "stale"', '# note', '[features]', 'web_search = true', ''].join('\n');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  assert.equal(written.text.includes('# note'), true);
  assert.equal(written.text.includes('[features]\nweb_search = true'), true);
  assert.equal(upsertMcpServer(written.text, 'fuxi-platform', FUXI_ENTRY).changed, false);
  assert.deepEqual(readMcpServers(written.text).names, ['fuxi-platform']);
});

// ---- 语义重定义（value vs table）：标准 TOML 拒绝，本解析器必须同样拒绝 ----
// 这些形态只有追踪 inline table / dotted key 建立的命名空间才能发现：
// 只看「同一个表内字面键重复」会漏掉它们，从而把畸形 Codex 配置当成合法并改写。
// 期望值以 Python tomllib 参考解析器的判定为准（见 PR #73 证据）。

const REDEFINITION_FIXTURES = {
  'inline env, then the [env] header (review case 1)': [
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    'env = { FUXI_API_URL = "http://x" }',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'FUXI_SKILL_TARGET = "C:/skill"',
    ''
  ],
  'dotted env, then the [env] header (review case 2)': [
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    'env.FUXI_API_URL = "http://x"',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'FUXI_SKILL_TARGET = "C:/skill"',
    ''
  ],
  'the [env] header first, then an inline env (reverse)': [
    '[mcp_servers.fuxi-platform.env]',
    'FUXI_SKILL_TARGET = "C:/skill"',
    '',
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    'env = { FUXI_API_URL = "http://x" }',
    ''
  ],
  'the [env] header first, then dotted env (reverse)': [
    '[mcp_servers.fuxi-platform.env]',
    'FUXI_SKILL_TARGET = "C:/skill"',
    '',
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    'env.FUXI_API_URL = "http://x"',
    ''
  ],
  'env as a value, then the [env] header': [
    '[mcp_servers.fuxi-platform]',
    'env = 1',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'A = "1"',
    ''
  ],
  'env as an array, then the [env] header': [
    '[mcp_servers.fuxi-platform]',
    'env = ["a"]',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'A = "1"',
    ''
  ],
  'the [env] header, then env as a value': [
    '[mcp_servers.fuxi-platform.env]',
    'A = "1"',
    '',
    '[mcp_servers.fuxi-platform]',
    'env = 1',
    ''
  ],
  'command as a value, then a [command] table': [
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    '',
    '[mcp_servers.fuxi-platform.command]',
    'sub = 1',
    ''
  ],
  'a [command] table, then command as a value': [
    '[mcp_servers.fuxi-platform.command]',
    'sub = 1',
    '',
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    ''
  ],
  'an inline table, then a deeper header inside it': [
    '[mcp_servers.fuxi-platform]',
    'env = { A = { B = "1" } }',
    '',
    '[mcp_servers.fuxi-platform.env.A.C]',
    'D = "2"',
    ''
  ],
  'an inline table, then a dotted key extending it': [
    '[mcp_servers.fuxi-platform]',
    'env = { A = "1" }',
    'env.B = "2"',
    ''
  ],
  'a deep dotted key, then a header on that exact path': [
    '[mcp_servers.fuxi-platform]',
    'env.A.B = "1"',
    '',
    '[mcp_servers.fuxi-platform.env.A]',
    'C = "2"',
    ''
  ],
  'a dotted value, then a header on that exact path': [
    '[mcp_servers.fuxi-platform]',
    'env.A = "1"',
    '',
    '[mcp_servers.fuxi-platform.env.A]',
    'B = "2"',
    ''
  ],
  'a dotted table, then a header on that exact path': [
    '[a]',
    'b.c = 1',
    '',
    '[a.b]',
    'd = 2',
    ''
  ],
  'a root dotted key, then its table header': [
    'a.b = 1',
    '',
    '[a]',
    'c = 2',
    ''
  ]
};

// 反向控制：这些是合法 TOML，绝不能被误判（否则会挡住用户的正常配置）。
const REDEFINITION_CONTROLS = {
  'inline env only': [
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    'env = { FUXI_API_URL = "http://x" }',
    ''
  ],
  'dotted env only': [
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    'env.A = "1"',
    'env.B = "2"',
    ''
  ],
  '[env] header only': [
    '[mcp_servers.fuxi-platform]',
    'command = "node"',
    '',
    '[mcp_servers.fuxi-platform.env]',
    'A = "1"',
    ''
  ],
  'a dotted table, then a new sibling header': [
    '[mcp_servers.fuxi-platform]',
    'env.A = "1"',
    '',
    '[mcp_servers.fuxi-platform.env.B]',
    'C = "2"',
    ''
  ],
  'a dotted table, then an unrelated header': [
    '[a]',
    'b.c = 1',
    '',
    '[a.z]',
    'y = 1',
    ''
  ],
  'a child header, then its parent header': [
    '[a.b.c]',
    'd = 1',
    '',
    '[a]',
    'e = 2',
    ''
  ],
  'a parent header, then a deeper header': [
    '[a]',
    '',
    '[a.b]',
    '',
    '[a.b.c]',
    'd = 1',
    ''
  ],
  'an inline table, then an unrelated header': [
    '[mcp_servers.fuxi-platform]',
    'env = { A = "1" }',
    '',
    '[mcp_servers.fuxi-platform.args]',
    'B = "2"',
    ''
  ],
  'repeated array-of-tables elements': [
    '[[skills.config]]',
    'name = "a"',
    '',
    '[[skills.config]]',
    'name = "b"',
    ''
  ],
  'an array-of-tables element sub-table, repeated': [
    '[[a]]',
    '',
    '[a.b]',
    'c = 1',
    '',
    '[[a]]',
    '',
    '[a.b]',
    'c = 2',
    ''
  ]
};

test('semantic value/table redefinitions are rejected on read and on rewrite', () => {
  for (const [label, lines] of Object.entries(REDEFINITION_FIXTURES)) {
    const fixture = lines.join('\n');
    assert.throws(
      () => readMcpServers(fixture),
      error => {
        assertTomlError(error, 'TOML_INVALID');
        assert.equal(typeof error.details.line, 'number', label + ': expected a line number');
        return true;
      },
      'read must reject: ' + label
    );
    // 解析在写之前失败，因此不可能产生任何改写结果。
    assert.throws(
      () => upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY),
      error => assertTomlError(error, 'TOML_INVALID'),
      'rewrite must reject: ' + label
    );
  }
});

test('valid TOML shapes are still accepted after the semantic checks', () => {
  for (const [label, lines] of Object.entries(REDEFINITION_CONTROLS)) {
    const fixture = lines.join('\n');
    // 必须能读：误判会让正常用户的配置被 MCP_CONFIG_INVALID 挡下。
    // （部分控制用例不含 mcp_servers，因此只断言"可解析"，不假设 server 数量。）
    assert.doesNotThrow(() => readMcpServers(fixture), label);
  }
});

// 参考解析器（Python tomllib）在 40 个 fixture 上的判定与本解析器逐条一致：
// 19/19 非法fixture 被拒、21/21 合法 fixture（含本机真实 config.toml）被接受。
// 这里固化为用例，避免后续改动悄悄放宽语义检查。
test('a real-world shaped config with repeated array-of-tables still parses and rewrites', () => {
  const fixture = [
    'approval_policy = "never"',
    '',
    '[mcp_servers.node_repl]',
    'command = "C:/runtimes/node.exe"',
    'startup_timeout_sec = 30',
    '',
    '[mcp_servers.node_repl.env]',
    'CODEX_HOME = "C:/codex"',
    '',
    '[[skills.config]]',
    'name = "a"',
    '',
    '[[skills.config]]',
    'name = "b"',
    '',
    '[shell_environment_policy.set]',
    'FOO = "bar"',
    ''
  ].join('\n');
  const written = upsertMcpServer(fixture, 'fuxi-platform', FUXI_ENTRY);
  assert.equal(written.changed, true);
  assert.equal(written.text.split('[[skills.config]]').length - 1, 2);
  assert.equal(written.text.includes('[shell_environment_policy.set]\nFOO = "bar"'), true);
  assert.equal(written.text.includes('startup_timeout_sec = 30'), true);
  assert.deepEqual(readMcpServers(written.text).names, ['node_repl', 'fuxi-platform']);
  assert.equal(upsertMcpServer(written.text, 'fuxi-platform', FUXI_ENTRY).changed, false);
});
