'use strict';

// 跨平台配置文件替换原语（零第三方依赖）。
//
// 背景：在 Windows 上 fs.renameSync(temp, existing) 会在目标已存在、或被宿主
// 进程（Codex/杀软/索引器）持有句柄时以 EPERM/EEXIST/EBUSY 失败——即 #33 已经
// 证实过的失败模式。Codex 的真实用户通常已经有 ~/.codex/config.toml，因此"目标
// 已存在"是常态而非例外。
//
// 策略：
// 1. 同目录写临时文件（同卷才能 rename）；
// 2. 优先 rename：目标不存在时在所有平台都成立，POSIX 上即使目标存在也成立；
// 3. 目标存在且 rename 报"替换类"错误时，回退为原地覆盖（copyFileSync）——
//    保留目标文件身份，不换 inode/句柄，正是监视场景需要的语义；
// 4. 每次尝试之间做有限退避，覆盖瞬时的共享冲突；
// 5. 任何失败路径都清理临时文件；彻底失败时抛结构化错误，
//    details 里带尝试次数与每轮错误码，便于诊断。

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_BACKOFF_MS = 40;
// 这些错误码在实践里表示"目标不可替换/暂不可写"，值得回退与重试。
const REPLACE_CLASS_CODES = new Set(['EPERM', 'EACCES', 'EEXIST', 'EBUSY', 'ENOTEMPTY', 'EISDIR', 'EUNKNOWN']);

let tempCounter = 0;

class ConfigWriteError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ConfigWriteError';
    this.code = code;
    this.details = details || {};
  }
}

function defaultSleep(ms) {
  if (!(ms > 0)) return;
  try {
    // 同步休眠，不占 CPU；共享内存不可用时退化为忙等。
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (error) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) { /* busy wait */ }
  }
}

function isReplaceClass(error) {
  return Boolean(error) && REPLACE_CLASS_CODES.has(String(error.code || ''));
}

function cleanupTemp(fsImpl, temp, failures) {
  try {
    fsImpl.rmSync(temp, { force: true });
    return true;
  } catch (error) {
    if (failures) failures.push({ stage: 'CLEANUP_TEMP', code: error.code || null });
    return false;
  }
}

function ensureDirectory(fsImpl, directory) {
  try {
    fsImpl.mkdirSync(directory, { recursive: true });
  } catch (error) {
    if (error && error.code === 'EEXIST') return;
    throw error;
  }
}

// 以"替换已有文件"的语义写入 UTF-8 文本。成功返回 { attempts, strategy }。
function writeFileReplacingSync(file, content, options) {
  const config = options || {};
  const fsImpl = config.fs || fs;
  const pathImpl = config.path || path;
  const requestedAttempts = Number(config.attempts);
  const attempts = Number.isFinite(requestedAttempts)
    ? Math.max(1, Math.floor(requestedAttempts))
    : DEFAULT_ATTEMPTS;
  const requestedBackoff = Number(config.backoffMs === undefined ? DEFAULT_BACKOFF_MS : config.backoffMs);
  const backoffMs = Number.isFinite(requestedBackoff) ? Math.max(0, requestedBackoff) : DEFAULT_BACKOFF_MS;
  const sleep = config.sleep || defaultSleep;

  const directory = pathImpl.dirname(file);
  try {
    ensureDirectory(fsImpl, directory);
  } catch (error) {
    throw new ConfigWriteError('MCP_CONFIG_WRITE_FAILED', 'Cannot create config directory: ' + error.message, {
      file, stage: 'ENSURE_DIRECTORY', cause: error.code || null
    });
  }

  tempCounter += 1;
  const temp = file + '.tmp-' + process.pid + '-' + Date.now() + '-' + tempCounter;
  try {
    fsImpl.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    const cleanupFailures = [];
    const tempRemoved = cleanupTemp(fsImpl, temp, cleanupFailures);
    throw new ConfigWriteError('MCP_CONFIG_WRITE_FAILED', 'Cannot write temporary config: ' + error.message, {
      file, tempFile: temp, stage: 'WRITE_TEMP', cause: error.code || null, tempRemoved, failures: cleanupFailures
    });
  }

  const failures = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let targetExists = false;
    try {
      targetExists = fsImpl.existsSync(file);
    } catch (error) {
      targetExists = false;
    }
    try {
      fsImpl.renameSync(temp, file);
      return { file, attempts: attempt, strategy: 'rename' };
    } catch (renameError) {
      failures.push({ attempt, strategy: 'rename', code: renameError.code || null });
      if (targetExists && isReplaceClass(renameError)) {
        try {
          fsImpl.copyFileSync(temp, file);
          if (!cleanupTemp(fsImpl, temp, failures)) {
            const cleanupError = new Error('Cannot remove temporary config after replacement');
            cleanupError.code = 'TEMP_CLEANUP_FAILED';
            throw cleanupError;
          }
          return { file, attempts: attempt, strategy: 'copy-overwrite' };
        } catch (copyError) {
          failures.push({ attempt, strategy: 'copy-overwrite', code: copyError.code || null });
        }
      }
    }
    if (attempt < attempts) sleep(backoffMs * attempt);
  }

  const cleaned = cleanupTemp(fsImpl, temp, failures);
  throw new ConfigWriteError(
    'MCP_CONFIG_WRITE_FAILED',
    'Cannot replace config file after ' + attempts + ' attempt(s)',
    { file, tempFile: temp, attempts, tempRemoved: cleaned, failures }
  );
}

module.exports = { ConfigWriteError, writeFileReplacingSync, DEFAULT_ATTEMPTS, DEFAULT_BACKOFF_MS };
