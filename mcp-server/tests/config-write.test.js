'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ConfigWriteError, writeFileReplacingSync } = require('../src/config-write');

function withTempDirectory(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-config-write-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function temporaryFiles(directory) {
  return fs.readdirSync(directory).filter(name => name.includes('.tmp-'));
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

test('replaces an existing config with the rename strategy and leaves no temp file', () => {
  withTempDirectory(root => {
    const file = path.join(root, 'config.toml');
    fs.writeFileSync(file, 'old = true\n');

    const result = writeFileReplacingSync(file, 'new = true\n', { backoffMs: 0 });

    assert.equal(result.strategy, 'rename');
    assert.equal(result.attempts, 1);
    assert.equal(fs.readFileSync(file, 'utf8'), 'new = true\n');
    assert.deepEqual(temporaryFiles(root), []);
  });
});

test('falls back to replace-existing copy and retries a transient Windows sharing error', () => {
  withTempDirectory(root => {
    const file = path.join(root, 'config.toml');
    fs.writeFileSync(file, 'old = true\n');
    let renameCalls = 0;
    let copyCalls = 0;
    const sleeps = [];
    const fsImpl = {
      ...fs,
      renameSync(source, destination) {
        renameCalls += 1;
        assert.equal(destination, file);
        throw codedError('EPERM');
      },
      copyFileSync(source, destination) {
        copyCalls += 1;
        if (copyCalls === 1) throw codedError('EBUSY');
        return fs.copyFileSync(source, destination);
      }
    };

    const result = writeFileReplacingSync(file, 'new = true\n', {
      fs: fsImpl,
      attempts: 4,
      backoffMs: 7,
      sleep: ms => sleeps.push(ms)
    });

    assert.equal(result.strategy, 'copy-overwrite');
    assert.equal(result.attempts, 2);
    assert.equal(renameCalls, 2);
    assert.equal(copyCalls, 2);
    assert.deepEqual(sleeps, [7]);
    assert.equal(fs.readFileSync(file, 'utf8'), 'new = true\n');
    assert.deepEqual(temporaryFiles(root), []);
  });
});

test('bounded replacement retries fail with structured details and remove the temp file', () => {
  withTempDirectory(root => {
    const file = path.join(root, 'config.toml');
    fs.writeFileSync(file, 'old = true\n');
    const sleeps = [];
    const fsImpl = {
      ...fs,
      renameSync() { throw codedError('EBUSY'); },
      copyFileSync() { throw codedError('EACCES'); }
    };

    assert.throws(
      () => writeFileReplacingSync(file, 'new = true\n', {
        fs: fsImpl,
        attempts: 3,
        backoffMs: 5,
        sleep: ms => sleeps.push(ms)
      }),
      error => {
        assert.ok(error instanceof ConfigWriteError);
        assert.equal(error.code, 'MCP_CONFIG_WRITE_FAILED');
        assert.equal(error.details.attempts, 3);
        assert.equal(error.details.tempRemoved, true);
        assert.equal(error.details.failures.length, 6);
        assert.deepEqual(error.details.failures.map(item => item.code),
          ['EBUSY', 'EACCES', 'EBUSY', 'EACCES', 'EBUSY', 'EACCES']);
        return true;
      }
    );

    assert.deepEqual(sleeps, [5, 10]);
    assert.equal(fs.readFileSync(file, 'utf8'), 'old = true\n');
    assert.deepEqual(temporaryFiles(root), []);
  });
});

test('temporary write failure is structured and attempts cleanup', () => {
  withTempDirectory(root => {
    const file = path.join(root, 'config.toml');
    let cleanupCalls = 0;
    const fsImpl = {
      ...fs,
      writeFileSync(target, ...args) {
        if (target.includes('.tmp-')) throw codedError('EIO');
        return fs.writeFileSync(target, ...args);
      },
      rmSync(target, options) {
        cleanupCalls += 1;
        return fs.rmSync(target, options);
      }
    };

    assert.throws(
      () => writeFileReplacingSync(file, 'new = true\n', { fs: fsImpl, backoffMs: 0 }),
      error => {
        assert.ok(error instanceof ConfigWriteError);
        assert.equal(error.code, 'MCP_CONFIG_WRITE_FAILED');
        assert.equal(error.details.stage, 'WRITE_TEMP');
        assert.equal(error.details.cause, 'EIO');
        assert.equal(error.details.tempRemoved, true);
        assert.deepEqual(error.details.failures, []);
        return true;
      }
    );

    assert.equal(cleanupCalls, 1);
    assert.equal(fs.existsSync(file), false);
    assert.deepEqual(temporaryFiles(root), []);
  });
});
