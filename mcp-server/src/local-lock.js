const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LOCK_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_MS = 50;
const DEFAULT_STALE_MS = 60000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readLockOwner(lockFile) {
  const value = fs.readFileSync(lockFile, 'utf8').trim();
  if (!/^\d+$/.test(value)) return null;
  const owner = Number(value);
  return Number.isSafeInteger(owner) && owner > 0 ? owner : null;
}

function removeStaleLock(lockFile, staleMs = DEFAULT_STALE_MS) {
  try {
    const stat = fs.statSync(lockFile);
    const owner = readLockOwner(lockFile);
    if (owner !== null) {
      if (processIsAlive(owner)) return false;
      fs.rmSync(lockFile, { force: true });
      return true;
    }
    if (Date.now() - stat.mtimeMs < staleMs) return false;
    fs.rmSync(lockFile, { force: true });
    return true;
  } catch (error) {
    return false;
  }
}

function openLock(lockFile) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const handle = fs.openSync(lockFile, 'wx');
  fs.writeSync(handle, `${process.pid}\n`);
  return () => {
    try { fs.closeSync(handle); } finally { fs.rmSync(lockFile, { force: true }); }
  };
}

function acquireFileLockSync(lockFile, options = {}) {
  const {
    errorCode = 'LOCKED',
    message = '本地任务正在执行',
    staleMs = DEFAULT_STALE_MS
  } = options;
  try {
    return openLock(lockFile);
  } catch (error) {
    if (error.code !== 'EEXIST' || !removeStaleLock(lockFile, staleMs)) {
      if (error.code === 'EEXIST') {
        const locked = new Error(message);
        locked.code = errorCode;
        locked.lockFile = lockFile;
        throw locked;
      }
      throw error;
    }
    return openLock(lockFile);
  }
}

async function acquireFileLock(lockFile, options = {}) {
  const {
    timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
    retryMs = DEFAULT_RETRY_MS,
    errorCode = 'LOCK_TIMEOUT',
    message = '本地任务正在执行',
    staleMs = DEFAULT_STALE_MS
  } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return openLock(lockFile);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      removeStaleLock(lockFile, staleMs);
      await sleep(retryMs);
    }
  }
  const locked = new Error(message);
  locked.code = errorCode;
  locked.lockFile = lockFile;
  throw locked;
}

module.exports = {
  acquireFileLock,
  acquireFileLockSync,
  removeStaleLock
};
