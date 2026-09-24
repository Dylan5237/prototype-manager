'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const { instanceLockPath } = require('../src/instance-lock');
const {
  NAMED_HOST_CLIENTS,
  hostCredentialsFile,
  legacyCredentialsFile,
  resolveCredentialsFile
} = require('../src/credentials-file');

function withHomedir(home, fn) {
  const original = os.homedir;
  os.homedir = () => home;
  try {
    return fn();
  } finally {
    os.homedir = original;
  }
}

function withCredentialsEnv(value, fn) {
  const previous = process.env.FUXI_CREDENTIALS_FILE;
  if (value === undefined) delete process.env.FUXI_CREDENTIALS_FILE;
  else process.env.FUXI_CREDENTIALS_FILE = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.FUXI_CREDENTIALS_FILE;
    else process.env.FUXI_CREDENTIALS_FILE = previous;
  }
}

test('named hosts resolve distinct credentials files under ~/.fuxi', () => {
  const home = path.join(os.tmpdir(), 'fuxi-creds-home-distinct');
  withHomedir(home, () => {
    const files = NAMED_HOST_CLIENTS.map(client => resolveCredentialsFile({ client }));
    assert.deepEqual(files, [
      path.join(home, '.fuxi', 'mcp-credentials-workbuddy.json'),
      path.join(home, '.fuxi', 'mcp-credentials-cursor.json'),
      path.join(home, '.fuxi', 'mcp-credentials-codex.json')
    ]);
    assert.equal(new Set(files).size, NAMED_HOST_CLIENTS.length);
  });
});

test('two hosts would not share the same instance lock path', () => {
  const home = path.join(os.tmpdir(), 'fuxi-creds-home-locks');
  withHomedir(home, () => {
    const locks = NAMED_HOST_CLIENTS.map(client => instanceLockPath(resolveCredentialsFile({ client })));
    assert.deepEqual(locks, [
      path.join(home, '.fuxi', 'mcp-credentials-workbuddy.json.instance.lock'),
      path.join(home, '.fuxi', 'mcp-credentials-cursor.json.instance.lock'),
      path.join(home, '.fuxi', 'mcp-credentials-codex.json.instance.lock')
    ]);
    assert.equal(new Set(locks).size, NAMED_HOST_CLIENTS.length);
    assert.equal(locks.includes(instanceLockPath(legacyCredentialsFile())), false);
  });
});

test('explicit credentials path wins over the named-host default', () => {
  const home = path.join(os.tmpdir(), 'fuxi-creds-home-explicit');
  const explicit = path.join(home, 'custom', 'device.json');
  withHomedir(home, () => {
    assert.equal(resolveCredentialsFile({ client: 'codex', explicit }), explicit);
    assert.equal(hostCredentialsFile('codex'), path.join(home, '.fuxi', 'mcp-credentials-codex.json'));
  });
});

test('named-host path wins over an inherited FUXI_CREDENTIALS_FILE', () => {
  const home = path.join(os.tmpdir(), 'fuxi-creds-home-env');
  const inherited = path.join(home, '.fuxi', 'mcp-credentials.json');
  withHomedir(home, () => withCredentialsEnv(inherited, () => {
    assert.equal(resolveCredentialsFile({ client: 'cursor' }), path.join(home, '.fuxi', 'mcp-credentials-cursor.json'));
    assert.equal(resolveCredentialsFile({ client: 'generic' }), inherited);
  }));
});

test('unknown clients fall back to the legacy credentials file when env is absent', () => {
  const home = path.join(os.tmpdir(), 'fuxi-creds-home-legacy');
  withHomedir(home, () => withCredentialsEnv(undefined, () => {
    assert.equal(resolveCredentialsFile({ client: 'generic' }), path.join(home, '.fuxi', 'mcp-credentials.json'));
    assert.equal(resolveCredentialsFile({}), path.join(home, '.fuxi', 'mcp-credentials.json'));
    assert.equal(hostCredentialsFile('generic'), null);
    assert.equal(hostCredentialsFile('auto'), null);
  }));
});
