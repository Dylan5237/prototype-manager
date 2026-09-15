const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { processIsAlive, tryAcquireFileLockSync } = require('./local-lock');
const { writeJsonAtomic } = require('./atomic-write');
const { normalizeApiUrl } = require('./credentials');

const STOP_WAIT_MS = 300;
const STOP_POLL_MS = 25;

function envFlag(name) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function shouldSkipInstanceLock() {
  return envFlag('FUXI_MCP_ALLOW_MULTI') || envFlag('FUXI_MCP_INSTANCE_LOCK_HELD');
}

function instanceIdentity({ credentialsFile, installRoot, apiUrl }) {
  const key = [
    path.resolve(credentialsFile),
    path.resolve(installRoot),
    normalizeApiUrl(apiUrl)
  ].join('\0');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function instancePaths({ credentialsFile, installRoot, apiUrl }) {
  const id = instanceIdentity({ credentialsFile, installRoot, apiUrl });
  const dir = path.dirname(path.resolve(credentialsFile));
  return {
    id,
    lockFile: path.join(dir, `mcp-instance-${id}.lock`),
    stateFile: path.join(dir, `mcp-instance-${id}.json`)
  };
}

function readInstanceState(stateFile) {
  try {
    const value = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    return null;
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function stopPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
  if (!processIsAlive(pid)) return;
  try { process.kill(pid, 'SIGTERM'); } catch (error) {}
}

function stopLeftoverPids(state) {
  if (!state) return;
  const pids = [state.pid, state.serverPid].filter((pid, index, list) => (
    Number.isInteger(pid) && pid > 0 && pid !== process.pid && list.indexOf(pid) === index
  ));
  for (const pid of pids) stopPid(pid);
  const deadline = Date.now() + STOP_WAIT_MS;
  while (Date.now() < deadline && pids.some(processIsAlive)) {
    sleepSync(STOP_POLL_MS);
  }
  for (const pid of pids) {
    if (!processIsAlive(pid)) continue;
    try { process.kill(pid, 'SIGKILL'); } catch (error) {}
  }
}

function writeInstanceState(stateFile, state) {
  writeJsonAtomic(stateFile, state, { mode: 0o600 });
}

function acquireMcpInstanceSync(options) {
  const {
    credentialsFile,
    installRoot,
    apiUrl,
    role = 'server'
  } = options;
  const paths = instancePaths({ credentialsFile, installRoot, apiUrl });
  if (shouldSkipInstanceLock()) {
    return { status: 'skipped', paths, owner: null, unlock() {}, noteChild() {} };
  }

  const claimed = tryAcquireFileLockSync(paths.lockFile);
  if (claimed.status === 'busy') {
    const ownerState = readInstanceState(paths.stateFile) || { pid: claimed.owner };
    return {
      status: 'already_running',
      paths,
      owner: ownerState,
      unlock() {},
      noteChild() {}
    };
  }

  stopLeftoverPids(readInstanceState(paths.stateFile));

  const state = {
    pid: process.pid,
    serverPid: role === 'server' ? process.pid : null,
    role,
    credentialsFile: path.resolve(credentialsFile),
    installRoot: path.resolve(installRoot),
    apiUrl: normalizeApiUrl(apiUrl),
    startedAt: new Date().toISOString()
  };
  writeInstanceState(paths.stateFile, state);

  let released = false;
  const unlock = () => {
    if (released) return;
    released = true;
    try { claimed.unlock(); } finally {
      try { fs.rmSync(paths.stateFile, { force: true }); } catch (error) {}
    }
  };

  return {
    status: 'acquired',
    paths,
    owner: state,
    unlock,
    noteChild(serverPid) {
      if (!Number.isInteger(serverPid) || serverPid <= 0) return;
      state.serverPid = serverPid;
      if (!released) writeInstanceState(paths.stateFile, state);
    }
  };
}

module.exports = {
  instanceIdentity,
  instancePaths,
  readInstanceState,
  acquireMcpInstanceSync,
  shouldSkipInstanceLock
};
