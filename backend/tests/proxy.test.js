const test = require('node:test');
const assert = require('node:assert/strict');

const { getWindowsSystemProxy } = require('../services/proxy');

test('non-Windows platforms do not execute the Windows registry probe', async () => {
  let executed = false;
  const proxy = await getWindowsSystemProxy({
    platform: 'linux',
    execute: () => {
      executed = true;
      throw new Error('reg query must not run');
    }
  });

  assert.equal(proxy, null);
  assert.equal(executed, false);
});

test('Windows registry proxy parsing preserves the existing simple host format', async () => {
  const proxy = await getWindowsSystemProxy({
    platform: 'win32',
    execute: () => 'ProxyServer    REG_SZ    127.0.0.1:7890\r\n'
  });

  assert.equal(proxy, 'http://127.0.0.1:7890');
});

test('Windows registry probe failures remain a non-blocking null result', async () => {
  const proxy = await getWindowsSystemProxy({
    platform: 'win32',
    execute: () => {
      throw new Error('registry unavailable');
    }
  });

  assert.equal(proxy, null);
});
