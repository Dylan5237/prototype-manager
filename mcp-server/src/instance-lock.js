const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { processIsAlive } = require('./local-lock');

const SCHEMA = 'fuxi-mcp-instance/1';
const DEFAULT_POLICY = 'takeover';
const DEFAULT_TAKEOVER_MS = 4000;
const DEFAULT_RETRY_MS = 50;
const POLICIES = new Set(['takeover', 'fail', 'shared']);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function instanceLockPath(credentialsFile) {
  return `${path.resolve(credentialsFile)}.instance.lock`;
}

function normalizePolicy(value) {
  const policy = String(value || process.env.FUXI_MCP_INSTANCE_POLICY || DEFAULT_POLICY).trim().toLowerCase();
  return POLICIES.has(policy) ? policy : DEFAULT_POLICY;
}

function inheritedOwnerPid() {
  const raw = Number(process.env.FUXI_MCP_INSTANCE_OWNER_PID);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

function uniquePids(record) {
  const pids = [];
  for (const value of [record && record.pid, record && record.childPid]) {
    const pid = Number(value);
    if (Number.isInteger(pid) && pid > 0 && !pids.includes(pid)) pids.push(pid);
  }
  return pids;
}

function livePids(record) {
  return uniquePids(record).filter(processIsAlive);
}

function readInstanceRecord(lockFile) {
  try {
    const raw = fs.readFileSync(lockFile, 'utf8').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const pid = Number(raw);
      return Number.isSafeInteger(pid) && pid > 0 ? { schema: SCHEMA, pid } : null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const pid = Number(parsed.pid);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function buildRecord({ credentialsFile, apiUrl, childPid = null }) {
  return {
    schema: SCHEMA,
    pid: process.pid,
    childPid: Number.isInteger(childPid) && childPid > 0 ? childPid : null,
    apiUrl: apiUrl || null,
    credentialsFile: path.resolve(credentialsFile),
    hostname: os.hostname(),
    startedAt: new Date().toISOString()
  };
}

function writeRecord(handle, record) {
  const payload = `${JSON.stringify(record, null, 2)}\n`;
  fs.ftruncateSync(handle, 0);
  fs.writeSync(handle, payload, 0, 'utf8');
}

function instanceInUseError(record, lockFile, extra) {
  const pid = record && record.pid ? record.pid : 'unknown';
  const child = record && record.childPid ? `，MCP pid ${record.childPid}` : '';
  const hint = extra ? ` ${extra}` : '';
  const error = new Error(
    `伏羲 MCP 已在本机运行（pid ${pid}${child}）。同机同凭证文件只允许一个实例。` +
    `请关闭另一个 AI 宿主中的伏羲 MCP，或结束上述进程后重试。${hint} ` +
    `诊断：FUXI_MCP_INSTANCE_POLICY=fail|takeover|shared；锁文件 ${lockFile}`
  );
  error.code = 'MCP_INSTANCE_IN_USE';
  error.lockFile = lockFile;
  error.owner = record;
  return error;
}

function requestExit(record) {
  for (const pid of uniquePids(record).reverse()) {
    if (!processIsAlive(pid) || pid === process.pid) continue;
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error && error.code !== 'ESRCH') throw error;
    }
  }
}

function tryReclaim(lockFile) {
  const record = readInstanceRecord(lockFile);
  if (livePids(record).length) return false;
  try {
    fs.rmSync(lockFile, { force: true });
    return true;
  } catch (error) {
    return false;
  }
}

function openInstanceLock({ credentialsFile, apiUrl, childPid = null }) {
  const lockFile = instanceLockPath(credentialsFile);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const handle = fs.openSync(lockFile, 'wx');
  const record = buildRecord({ credentialsFile, apiUrl, childPid });
  writeRecord(handle, record);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try { fs.closeSync(handle); } finally { fs.rmSync(lockFile, { force: true }); }
  };
  return {
    policy: normalizePolicy(),
    inherited: false,
    shared: false,
    lockFile,
    record,
    release,
    setChildPid(pid) {
      if (released) return;
      const next = { ...record, childPid: Number(pid) || null };
      writeRecord(handle, next);
      this.record = next;
    }
  };
}

function claimOnce(options, policy) {
  const credentialsFile = path.resolve(options.credentialsFile);
  const inherited = inheritedOwnerPid();
  if (inherited && (inherited === process.pid || processIsAlive(inherited))) {
    return {
      policy,
      inherited: true,
      shared: false,
      ownerPid: inherited,
      lockFile: instanceLockPath(credentialsFile),
      record: readInstanceRecord(instanceLockPath(credentialsFile)),
      release() {},
      setChildPid() {}
    };
  }
  if (policy === 'shared') {
    return {
      policy,
      inherited: false,
      shared: true,
      lockFile: instanceLockPath(credentialsFile),
      record: null,
      release() {},
      setChildPid() {}
    };
  }
  try {
    return openInstanceLock(options);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const lockFile = instanceLockPath(options.credentialsFile);
    const record = readInstanceRecord(lockFile);
    if (tryReclaim(lockFile)) return openInstanceLock(options);
    if (record && uniquePids(record).includes(process.pid) && livePids(record).every(pid => pid === process.pid)) {
      return {
        policy,
        inherited: true,
        shared: false,
        ownerPid: process.pid,
        lockFile,
        record,
        release() {},
        setChildPid() {}
      };
    }
    error.record = record;
    error.lockFile = lockFile;
    throw error;
  }
}

function claimMcpInstanceSync(options = {}) {
  const policy = normalizePolicy(options.policy);
  const timeoutMs = Number(options.timeoutMs || process.env.FUXI_MCP_INSTANCE_TAKEOVER_MS || DEFAULT_TAKEOVER_MS);
  const retryMs = Number(options.retryMs || DEFAULT_RETRY_MS);
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (true) {
    try {
      return claimOnce(options, policy);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const lockFile = error.lockFile || instanceLockPath(options.credentialsFile);
      const record = error.record || readInstanceRecord(lockFile);
      if (policy === 'fail') throw instanceInUseError(record, lockFile);
      requestExit(record);
      if (Date.now() >= deadline) {
        throw instanceInUseError(record, lockFile, '接管等待超时，未强制 SIGKILL。');
      }
      sleepSync(retryMs);
      tryReclaim(lockFile);
    }
  }
}

async function claimMcpInstance(options = {}) {
  const policy = normalizePolicy(options.policy);
  const timeoutMs = Number(options.timeoutMs || process.env.FUXI_MCP_INSTANCE_TAKEOVER_MS || DEFAULT_TAKEOVER_MS);
  const retryMs = Number(options.retryMs || DEFAULT_RETRY_MS);
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (true) {
    try {
      return claimOnce(options, policy);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const lockFile = error.lockFile || instanceLockPath(options.credentialsFile);
      const record = error.record || readInstanceRecord(lockFile);
      if (policy === 'fail') throw instanceInUseError(record, lockFile);
      requestExit(record);
      if (Date.now() >= deadline) {
        throw instanceInUseError(record, lockFile, '接管等待超时，未强制 SIGKILL。');
      }
      await sleep(retryMs);
      tryReclaim(lockFile);
    }
  }
}

function installInstanceGuard(options = {}) {
  const claim = claimMcpInstanceSync(options);
  const release = () => {
    try { claim.release(); } catch (error) {}
  };
  process.on('exit', release);
  process.once('SIGTERM', () => {
    release();
    process.exit(0);
  });
  process.once('SIGINT', () => {
    release();
    process.exit(0);
  });
  return claim;
}

module.exports = {
  SCHEMA,
  claimMcpInstance,
  claimMcpInstanceSync,
  installInstanceGuard,
  instanceLockPath,
  normalizePolicy,
  readInstanceRecord
};
