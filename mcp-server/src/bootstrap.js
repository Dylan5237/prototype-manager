#!/usr/bin/env node

// Deterministic first-install runner. This is a CLI shipped with the MCP
// package; it is not an MCP tool and does not create a second Fuxi client.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseZipBuffer } = require('./fuxi-zip');
const { acquireFileLockSync } = require('./local-lock');

const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_INSTALL_ROOT = path.join(os.homedir(), '.fuxi', 'agent-runtime');
const DEFAULT_CREDENTIALS_FILE = path.join(os.homedir(), '.fuxi', 'mcp-credentials.json');
const SHARED_INSTALL_LOCK = path.join('install', 'update.lock');
const PACKAGE_ROOTS = {
  mcp: 'fuxi-platform-mcp',
  skill: 'fuxi-prototype'
};
const MCP_PATH_ENV_KEYS = new Set([
  'FUXI_CREDENTIALS_FILE',
  'FUXI_MCP_TARGET',
  'FUXI_INSTALL_ROOT',
  'FUXI_SKILL_TARGET'
]);
const FORBIDDEN_ENTRY_SEGMENTS = new Set([
  '.git', '.svn', '.hg', 'node_modules', '.npmrc', '.env',
  '.credentials.json', 'credentials.json', 'mcp-credentials.json',
  'tests', '__tests__', 'coverage', 'logs', 'uploads', 'repos'
]);

class BootstrapError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BootstrapError';
    this.code = code;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeApiUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizePathForComparison(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = path.normalize(value.trim());
  const resolved = path.resolve(normalized);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  const normalizedLeft = normalizePathForComparison(left);
  const normalizedRight = normalizePathForComparison(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseArgs(argv) {
  const args = { command: argv[0] || '', values: {} };
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    args.values[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function absolute(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('<') || value.includes('>')) {
    throw new BootstrapError('PATH_REQUIRED', `${label} must be an absolute path`, { field: label });
  }
  if (!path.isAbsolute(value)) {
    throw new BootstrapError('PATH_REQUIRED', `${label} must be an absolute path`, { field: label });
  }
  const resolved = path.resolve(value);
  return resolved;
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new BootstrapError('MANIFEST_INVALID', `Cannot read JSON: ${error.message}`, { file });
  }
}

function writeJsonAtomic(file, value) {
  ensureDirectory(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
}

function acquireBootstrapLock(lockFile) {
  try {
    return acquireFileLockSync(lockFile, {
      errorCode: 'BOOTSTRAP_LOCKED',
      message: '另一个伏羲接入或更新任务正在执行'
    });
  } catch (error) {
    if (error.code === 'BOOTSTRAP_LOCKED') {
      throw new BootstrapError(error.code, error.message, { lockFile });
    }
    throw error;
  }
}

function readManifest(file) {
  const manifest = readJson(absolute(file, 'manifest'));
  if (!manifest || manifest.schema !== 'fuxi-bootstrap/2') {
    throw new BootstrapError('MANIFEST_INVALID', 'Unsupported bootstrap manifest schema');
  }
  if (!manifest.apiUrl || !manifest.bootstrapId) {
    throw new BootstrapError('MANIFEST_INVALID', 'Bootstrap manifest requires apiUrl and bootstrapId');
  }
  return manifest;
}

function clientTargets(manifest, options = {}) {
  const client = manifest.client || {};
  const name = String(options.client || client.name || 'auto').trim().toLowerCase();
  const configValue = options['mcp-config'] || client.mcpConfig || process.env.FUXI_MCP_CONFIG || '';
  const skillValue = options['skill-target'] || client.skillTarget || process.env.FUXI_SKILL_TARGET || '';

  let mcpConfig = configValue;
  let skillTarget = skillValue;
  if (!mcpConfig && name === 'cursor') {
    const candidates = [
      path.join(os.homedir(), '.cursor', 'mcp.json'),
      process.env.APPDATA ? path.join(process.env.APPDATA, 'Cursor', 'User', 'mcp.json') : ''
    ].filter(Boolean);
    mcpConfig = candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
  }
  if (!mcpConfig && name === 'workbuddy') {
    mcpConfig = path.join(os.homedir(), '.workbuddy', 'mcp.json');
  }
  if (!skillTarget && name === 'cursor') {
    skillTarget = path.join(os.homedir(), '.cursor', 'skills', 'fuxi-prototype');
  }
  if (!skillTarget && name === 'workbuddy') {
    skillTarget = path.join(os.homedir(), '.workbuddy', 'skills', 'fuxi-prototype');
  }
  if (!mcpConfig) throw new BootstrapError('CLIENT_CONFIG_REQUIRED', 'MCP configuration path was not identified', { client: name });
  if (!skillTarget) throw new BootstrapError('CLIENT_SKILL_TARGET_REQUIRED', 'Skill installation path was not identified', { client: name });

  return {
    name,
    mcpConfig: absolute(mcpConfig, 'mcpConfig'),
    skillTarget: absolute(skillTarget, 'skillTarget'),
    format: client.configFormat || 'json'
  };
}

function checkWritable(target) {
  const existing = fs.existsSync(target) ? target : path.dirname(target);
  try {
    fs.accessSync(existing, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function preflight(manifest, options = {}) {
  if (process.versions.node.split('.')[0] < 18) {
    throw new BootstrapError('NODE_VERSION_UNSUPPORTED', 'Node.js >= 18 is required', { nodeVersion: process.version });
  }
  const targets = clientTargets(manifest, options);
  if (targets.format !== 'json') {
    throw new BootstrapError('CONFIG_FORMAT_UNSUPPORTED', `MCP config format is not supported: ${targets.format}`, { format: targets.format });
  }
  let config = {};
  if (fs.existsSync(targets.mcpConfig)) {
    try {
      config = readJson(targets.mcpConfig);
    } catch (error) {
      if (error instanceof BootstrapError) {
        throw new BootstrapError('MCP_CONFIG_INVALID', error.message, { file: targets.mcpConfig });
      }
      throw error;
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new BootstrapError('MCP_CONFIG_INVALID', 'MCP config root must be a JSON object', { file: targets.mcpConfig });
    }
  }
  const plan = {
    ok: true,
    status: 'READY',
    client: targets.name,
    mcpConfig: targets.mcpConfig,
    skillTarget: targets.skillTarget,
    configExists: fs.existsSync(targets.mcpConfig),
    skillExists: fs.existsSync(targets.skillTarget),
    writable: checkWritable(targets.mcpConfig) && checkWritable(targets.skillTarget),
    configFormat: targets.format,
    backupRequired: fs.existsSync(targets.mcpConfig) || fs.existsSync(targets.skillTarget),
    reloadRequired: true,
    existingMcpEntries: config.mcpServers && typeof config.mcpServers === 'object' ? Object.keys(config.mcpServers) : []
  };
  if (!plan.writable) {
    throw new BootstrapError('WRITE_PERMISSION_REQUIRED', 'MCP config or Skill target is not writable', plan);
  }
  return plan;
}

function safeEntryName(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || normalized.startsWith('/') || parts.some(part => part === '.' || part === '..')) {
    throw new BootstrapError('ARTIFACT_UNSAFE_PATH', `Unsafe ZIP entry: ${value}`);
  }
  if (parts.some(part => FORBIDDEN_ENTRY_SEGMENTS.has(part) || part.endsWith('.log'))) {
    throw new BootstrapError('ARTIFACT_FORBIDDEN_ENTRY', `Forbidden ZIP entry: ${value}`);
  }
  return parts.join('/');
}

function extractPackage(buffer, targetDir, packageType) {
  let parsed;
  try {
    parsed = parseZipBuffer(buffer);
  } catch (error) {
    if (error && error.code === 'UNSAFE_ENTRY') {
      throw new BootstrapError('ARTIFACT_UNSAFE_PATH', error.message);
    }
    throw new BootstrapError('ARTIFACT_INVALID_ZIP', error.message);
  }
  if (!parsed.entries.length || parsed.entries.length > MAX_ZIP_ENTRIES) {
    throw new BootstrapError('ARTIFACT_INVALID_ZIP', 'ZIP entry count is invalid');
  }
  const expectedRoot = PACKAGE_ROOTS[packageType];
  const extracted = [];
  for (const entry of parsed.entries) {
    const safe = safeEntryName(entry.name);
    if (!entry.decompressed || safe.endsWith('/')) continue;
    const target = path.resolve(targetDir, ...safe.split('/'));
    const base = path.resolve(targetDir) + path.sep;
    if (!target.startsWith(base)) throw new BootstrapError('ARTIFACT_UNSAFE_PATH', `ZIP entry escapes staging: ${entry.name}`);
    ensureDirectory(path.dirname(target));
    fs.writeFileSync(target, entry.decompressed);
    extracted.push(safe);
  }
  const rootPrefix = `${expectedRoot}/`;
  const rootFiles = extracted.filter(entry => entry.startsWith(rootPrefix));
  const packageRoot = rootFiles.length ? path.join(targetDir, expectedRoot) : targetDir;
  const required = packageType === 'mcp'
    ? ['src/server.js', 'src/launcher.js', 'src/bootstrap.js', 'src/local-lock.js', 'package.json']
    : ['SKILL.md'];
  for (const requiredFile of required) {
    if (!fs.existsSync(path.join(packageRoot, requiredFile))) {
      throw new BootstrapError('ARTIFACT_ENTRY_MISSING', `Package is missing ${requiredFile}`, { packageType });
    }
  }
  return { packageRoot, entries: extracted };
}

function timeoutError(code, message, details = {}) {
  return new BootstrapError(code, message, details);
}

async function fetchBuffer(urlValue, token, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = new URL(urlValue);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!response.ok) throw new BootstrapError('ARTIFACT_DOWNLOAD_FAILED', `HTTP ${response.status}`, { url: url.origin, status: response.status });
    if (buffer.length > MAX_ARTIFACT_BYTES) throw new BootstrapError('ARTIFACT_TOO_LARGE', 'Artifact exceeds 100 MB', { size: buffer.length });
    return { buffer, headers: response.headers };
  } catch (error) {
    if (error.name === 'AbortError') throw timeoutError('NETWORK_TIMEOUT', 'Artifact download timed out', { timeoutMs, url: url.origin });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadArtifact(artifact, token, targetFile, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!artifact || !artifact.url) throw new BootstrapError('MANIFEST_INVALID', 'Artifact URL is missing');
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchBuffer(artifact.url, token, timeoutMs);
      const actualSha256 = sha256(response.buffer);
      const expectedSha256 = artifact.sha256 ? String(artifact.sha256).toLowerCase() : null;
      if (expectedSha256 && actualSha256 !== expectedSha256) {
        throw new BootstrapError('ARTIFACT_DIGEST_MISMATCH', 'Artifact SHA-256 does not match manifest', { expectedSha256, actualSha256 });
      }
      if (artifact.size != null && Number(artifact.size) !== response.buffer.length) {
        throw new BootstrapError('ARTIFACT_SIZE_MISMATCH', 'Artifact size does not match manifest', { expectedSize: Number(artifact.size), actualSize: response.buffer.length });
      }
      ensureDirectory(path.dirname(targetFile));
      fs.writeFileSync(targetFile, response.buffer, { mode: 0o600 });
      return { path: targetFile, size: response.buffer.length, sha256: actualSha256, attempt };
    } catch (error) {
      lastError = error;
      if (error.code === 'ARTIFACT_DIGEST_MISMATCH' || error.code === 'ARTIFACT_SIZE_MISMATCH' || error.code === 'ARTIFACT_INVALID_ZIP') break;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

function validateArtifactBuffer(buffer, artifact) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_ARTIFACT_BYTES) {
    throw new BootstrapError('ARTIFACT_TOO_LARGE', 'Artifact exceeds 100 MB', { size: buffer && buffer.length });
  }
  const actualSha256 = sha256(buffer);
  const expectedSha256 = artifact && artifact.sha256 ? String(artifact.sha256).toLowerCase() : null;
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new BootstrapError('ARTIFACT_DIGEST_MISMATCH', 'Artifact SHA-256 does not match manifest', { expectedSha256, actualSha256 });
  }
  if (artifact && artifact.size != null && Number(artifact.size) !== buffer.length) {
    throw new BootstrapError('ARTIFACT_SIZE_MISMATCH', 'Artifact size does not match manifest', { expectedSize: Number(artifact.size), actualSize: buffer.length });
  }
  return { size: buffer.length, sha256: actualSha256 };
}

async function loadLocalArtifact(artifact, sourceFile, targetFile) {
  const source = absolute(sourceFile, 'artifact');
  let buffer;
  try {
    buffer = fs.readFileSync(source);
  } catch (error) {
    throw new BootstrapError('ARTIFACT_FILE_NOT_FOUND', `Cannot read local artifact: ${error.message}`, { file: source });
  }
  const digest = validateArtifactBuffer(buffer, artifact || {});
  ensureDirectory(path.dirname(targetFile));
  fs.copyFileSync(source, targetFile);
  try { fs.chmodSync(targetFile, 0o600); } catch (error) {}
  return { path: targetFile, ...digest, attempt: 0, source };
}

function copyTree(source, target) {
  if (!fs.existsSync(source)) return false;
  ensureDirectory(path.dirname(target));
  fs.cpSync(source, target, { recursive: true, force: true });
  return true;
}

function removePath(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function backupPath(root, label) {
  return path.join(root, 'backup', `${label}-${Date.now()}`);
}

function backupFileOrDirectory(source, target) {
  if (!fs.existsSync(source)) return false;
  ensureDirectory(path.dirname(target));
  fs.cpSync(source, target, { recursive: true, force: true });
  return true;
}

function restoreBackup(source, target) {
  if (fs.existsSync(source)) {
    removePath(target);
    fs.cpSync(source, target, { recursive: true, force: true });
  } else {
    removePath(target);
  }
}

function mcpEntry(manifest, mcpRoot, skillTarget, credentialsFile, installRoot, connectCode) {
  const launcher = path.join(mcpRoot, 'src', 'launcher.js');
  const server = path.join(mcpRoot, 'src', 'server.js');
  const env = {
    FUXI_API_URL: normalizeApiUrl(manifest.apiUrl),
    FUXI_CREDENTIALS_FILE: credentialsFile,
    FUXI_MCP_TARGET: server,
    FUXI_INSTALL_ROOT: installRoot,
    FUXI_SKILL_TARGET: skillTarget
  };
  if (connectCode) env.FUXI_CONNECT_CODE = connectCode;
  return { command: process.execPath, args: [launcher], env };
}

function mcpEntryMatchesState(entry, state, manifest) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (!state || !state.mcpRoot || !state.skillTarget || !state.credentialsFile || !state.installRoot) return false;

  const expected = mcpEntry(
    { apiUrl: manifest.apiUrl },
    state.mcpRoot,
    state.skillTarget,
    state.credentialsFile,
    state.installRoot,
    null
  );
  if (!samePath(entry.command, expected.command)) return false;
  if (!Array.isArray(entry.args) || entry.args.length !== expected.args.length || !entry.args.every((value, index) => samePath(value, expected.args[index]))) {
    return false;
  }
  if (!entry.env || typeof entry.env !== 'object' || Array.isArray(entry.env)) return false;

  const expectedEnv = expected.env;
  for (const [key, expectedValue] of Object.entries(expectedEnv)) {
    if (key === 'FUXI_MCP_TARGET' && !Object.prototype.hasOwnProperty.call(entry.env, key)) continue;
    const actualValue = entry.env[key];
    if (MCP_PATH_ENV_KEYS.has(key)) {
      if (!samePath(actualValue, expectedValue)) return false;
    } else if (key === 'FUXI_API_URL') {
      if (normalizeApiUrl(actualValue) !== normalizeApiUrl(expectedValue)) return false;
    } else if (actualValue !== expectedValue) {
      return false;
    }
  }
  return true;
}

function mergeMcpConfig(config, entry) {
  const output = config && typeof config === 'object' && !Array.isArray(config) ? { ...config } : {};
  const servers = output.mcpServers && typeof output.mcpServers === 'object' && !Array.isArray(output.mcpServers)
    ? { ...output.mcpServers }
    : {};
  servers['fuxi-platform'] = entry;
  output.mcpServers = servers;
  return output;
}

function readConfig(file) {
  if (!fs.existsSync(file)) return {};
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('root must be an object');
    return value;
  } catch (error) {
    throw new BootstrapError('MCP_CONFIG_INVALID', `Cannot parse MCP config: ${error.message}`, { file });
  }
}

function writeConfig(file, value) {
  writeJsonAtomic(file, value);
}

function parseToolReply(line, id) {
  try {
    const message = JSON.parse(line);
    if (message.id !== id) return null;
    if (message.error) throw new BootstrapError('MCP_SELF_TEST_FAILED', message.error.message || 'MCP JSON-RPC error', { rpcCode: message.error.code });
    const content = message.result && Array.isArray(message.result.content) ? message.result.content[0] : null;
    if (!content || typeof content.text !== 'string') throw new BootstrapError('MCP_SELF_TEST_FAILED', 'MCP result has no JSON text content');
    try { return JSON.parse(content.text); } catch (error) { throw new BootstrapError('MCP_SELF_TEST_FAILED', 'MCP result is not JSON text'); }
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    return null;
  }
}

function selfTest(serverPath, env, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch (killError) {}
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(timeoutError('MCP_SELF_TEST_TIMEOUT', 'MCP check_connection timed out', { timeoutMs })), timeoutMs);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id === 2) {
            const value = parseToolReply(line, 2);
            if (!value || value.ok !== true || value.authentication !== 'verified') {
              finish(new BootstrapError('MCP_CONNECTION_NOT_VERIFIED', 'check_connection did not return verified authentication', { result: value }));
            } else {
              finish(null, value);
            }
          }
        } catch (error) {
          finish(error);
        }
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => finish(new BootstrapError('MCP_PROCESS_FAILED', error.message)));
    child.on('exit', code => {
      if (!settled && code !== 0) finish(new BootstrapError('MCP_PROCESS_FAILED', `MCP exited with code ${code}`, { stderr: stderr.slice(0, 300) }));
    });
    child.stdin.end([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_connection', arguments: {} } })
    ].join('\n') + '\n');
  });
}

function buildState({ manifest, plan, state, mcp, skill, mcpRoot, credentialsFile, installRoot, selfTestResult, timings, error }) {
  return {
    schema: 'fuxi-bootstrap-state/1',
    bootstrapId: manifest.bootstrapId,
    status: error ? 'FAILED' : 'COMPLETE',
    step: error ? (error.step || 'RECOVERY') : 'VERIFY',
    nextAction: error ? '修正 failure.code 对应问题后，使用新的 bootstrap manifest 重试' : '重启或刷新 AI 客户端，然后调用 check_connection({}) 完成重载后验证',
    client: plan.client,
    apiUrl: manifest.apiUrl,
    statePath: state,
    mcpConfig: plan.mcpConfig,
    skillTarget: plan.skillTarget,
    mcpRoot,
    credentialsFile,
    installRoot,
    mcpConnected: Boolean(selfTestResult),
    skillReady: fs.existsSync(path.join(plan.skillTarget, 'SKILL.md')),
    reloadRequired: true,
    postReloadVerified: false,
    artifacts: {
      mcp: mcp ? { size: mcp.size, sha256: mcp.sha256 } : null,
      skill: skill ? { size: skill.size, sha256: skill.sha256 } : null
    },
    runtime: selfTestResult ? {
      mcpVersion: selfTestResult.runtime && selfTestResult.runtime.mcpVersion,
      skillVersion: selfTestResult.runtime && selfTestResult.runtime.skillVersion
    } : null,
    timings: timings || null,
    failure: error ? { code: error.code || 'BOOTSTRAP_FAILED', message: error.message, step: error.step || null } : null,
    updatedAt: nowIso()
  };
}

function readCompletedInstall(stateFile, manifest) {
  if (!fs.existsSync(stateFile)) return null;
  try {
    const state = readJson(stateFile);
    if (state.status !== 'COMPLETE' || state.mcpConnected !== true) return null;
    if (state.apiUrl && normalizeApiUrl(state.apiUrl) !== normalizeApiUrl(manifest.apiUrl)) return null;
    const mcpReady = Boolean(state.mcpRoot && fs.existsSync(path.join(state.mcpRoot, 'src', 'server.js')) && fs.existsSync(path.join(state.mcpRoot, 'src', 'launcher.js')));
    const skillReady = Boolean(state.skillTarget && fs.existsSync(path.join(state.skillTarget, 'SKILL.md')));
    const config = state.mcpConfig && fs.existsSync(state.mcpConfig) ? readConfig(state.mcpConfig) : null;
    const configEntry = config && config.mcpServers && config.mcpServers['fuxi-platform'];
    if (!mcpReady || !skillReady || !mcpEntryMatchesState(configEntry, state, manifest)) return null;
    return state;
  } catch (error) {
    return null;
  }
}

async function install(manifest, options = {}) {
  const installRoot = absolute(options['install-root'] || manifest.installRoot || process.env.FUXI_INSTALL_ROOT || DEFAULT_INSTALL_ROOT, 'installRoot');
  const credentialsFile = absolute(options['credentials-file'] || manifest.credentialsFile || process.env.FUXI_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_FILE, 'credentialsFile');
  const state = absolute(options.state || manifest.stateFile || path.join(installRoot, 'bootstrap-state.json'), 'state');
  const unlock = acquireBootstrapLock(path.join(installRoot, SHARED_INSTALL_LOCK));
  const staging = path.join(installRoot, 'bootstrap', manifest.bootstrapId);
  const mcpInstallRoot = path.join(installRoot, 'bootstrap-mcp', 'fuxi-platform-mcp');
  const backupRoot = path.join(staging, 'backup');
  const mcpConfigBackup = path.join(backupRoot, 'mcp-config');
  const skillBackup = path.join(backupRoot, 'skill');
  const mcpBackup = path.join(backupRoot, 'mcp');
  const credentialsBackup = path.join(backupRoot, 'credentials');
  let mcpInfo = null;
  let skillInfo = null;
  let selfTestResult = null;
  let configWritten = false;
  let skillInstalled = false;
  let mcpInstalled = false;
  let selfTestStarted = false;
  let step = 'BACKUP';
  let plan = null;
  const timings = {};
  const startedAt = Date.now();
  const mark = (name, started) => { timings[name] = Date.now() - started; };
  try {
    const existing = readCompletedInstall(state, manifest);
    if (existing) {
      return {
        ...existing,
        reason: 'ALREADY_COMPLETE',
        nextAction: existing.postReloadVerified ? '伏羲 MCP 已接入并验证，无需重复安装' : '如客户端尚未重载，请重启或刷新 AI 客户端后调用 check_connection({})',
        timings: { totalMs: Date.now() - startedAt, idempotentMs: Date.now() - startedAt }
      };
    }

    step = 'PRECHECK';
    let stageStarted = Date.now();
    plan = preflight(manifest, options);
    mark('preflightMs', stageStarted);

    ensureDirectory(staging);
    ensureDirectory(backupRoot);
    backupFileOrDirectory(plan.mcpConfig, mcpConfigBackup);
    backupFileOrDirectory(plan.skillTarget, skillBackup);
    backupFileOrDirectory(mcpInstallRoot, mcpBackup);
    backupFileOrDirectory(credentialsFile, credentialsBackup);

    step = 'DOWNLOAD_VERIFY';
    stageStarted = Date.now();
    const token = manifest.installToken || process.env.FUXI_INSTALL_TOKEN || '';
    const localMcpZip = options['mcp-zip'] ? absolute(options['mcp-zip'], 'mcpZip') : null;
    const localSkillZip = options['skill-zip'] ? absolute(options['skill-zip'], 'skillZip') : null;
    [mcpInfo, skillInfo] = await Promise.all([
      localMcpZip
        ? loadLocalArtifact(manifest.artifacts && manifest.artifacts.mcp, localMcpZip, path.join(staging, 'mcp.zip'))
        : downloadArtifact(manifest.artifacts && manifest.artifacts.mcp, token, path.join(staging, 'mcp.zip')),
      localSkillZip
        ? loadLocalArtifact(manifest.artifacts && manifest.artifacts.skill, localSkillZip, path.join(staging, 'skill.zip'))
        : downloadArtifact(manifest.artifacts && manifest.artifacts.skill, token, path.join(staging, 'skill.zip'))
    ]);
    const mcpExtracted = extractPackage(fs.readFileSync(mcpInfo.path), path.join(staging, 'mcp'), 'mcp');
    const skillExtracted = extractPackage(fs.readFileSync(skillInfo.path), path.join(staging, 'skill'), 'skill');
    mark('downloadVerifyMs', stageStarted);

    step = 'INSTALL';
    stageStarted = Date.now();
    removePath(mcpInstallRoot);
    ensureDirectory(path.dirname(mcpInstallRoot));
    copyTree(mcpExtracted.packageRoot, mcpInstallRoot);
    mcpInstalled = true;

    removePath(plan.skillTarget);
    ensureDirectory(path.dirname(plan.skillTarget));
    copyTree(skillExtracted.packageRoot, plan.skillTarget);
    skillInstalled = true;
    mark('installMs', stageStarted);

    step = 'CONFIGURE';
    stageStarted = Date.now();
    const config = readConfig(plan.mcpConfig);
    const entry = mcpEntry(manifest, mcpInstallRoot, plan.skillTarget, credentialsFile, installRoot, manifest.connectCode);
    writeConfig(plan.mcpConfig, mergeMcpConfig(config, entry));
    configWritten = true;
    mark('configureMs', stageStarted);

    step = 'CONNECT';
    stageStarted = Date.now();
    selfTestStarted = true;
    selfTestResult = await selfTest(path.join(mcpInstallRoot, 'src', 'server.js'), {
      ...process.env,
      FUXI_API_URL: String(manifest.apiUrl).replace(/\/+$/, ''),
      FUXI_CONNECT_CODE: manifest.connectCode || '',
      FUXI_CREDENTIALS_FILE: credentialsFile,
      FUXI_MCP_TARGET: path.join(mcpInstallRoot, 'src', 'server.js'),
      FUXI_INSTALL_ROOT: installRoot,
      FUXI_SKILL_TARGET: plan.skillTarget,
      FUXI_SKILL_VERSION: manifest.skillVersion || 'unknown'
    }, Number(options['timeout-ms'] || DEFAULT_TIMEOUT_MS));
    mark('connectMs', stageStarted);

    step = 'VERIFY';
    stageStarted = Date.now();
    const finalConfig = readConfig(plan.mcpConfig);
    if (finalConfig.mcpServers && finalConfig.mcpServers['fuxi-platform']) {
      const finalEntry = { ...finalConfig.mcpServers['fuxi-platform'] };
      if (finalEntry.env) {
        finalEntry.env = { ...finalEntry.env };
        delete finalEntry.env.FUXI_CONNECT_CODE;
      }
      writeConfig(plan.mcpConfig, mergeMcpConfig({ ...finalConfig, mcpServers: { ...finalConfig.mcpServers } }, finalEntry));
    }
    removePath(path.join(staging, 'mcp.zip'));
    removePath(path.join(staging, 'skill.zip'));
    mark('verifyMs', stageStarted);
    timings.totalMs = Date.now() - startedAt;
    const result = buildState({ manifest, plan, state, mcp: mcpInfo, skill: skillInfo, mcpRoot: mcpInstallRoot, credentialsFile, installRoot, selfTestResult, timings });
    writeJsonAtomic(state, result);
    removePath(staging);
    return result;
  } catch (error) {
    const wrapped = error instanceof BootstrapError ? error : new BootstrapError('BOOTSTRAP_FAILED', error.message);
    wrapped.step = wrapped.step || step;
    if (plan && (configWritten || fs.existsSync(mcpConfigBackup))) restoreBackup(mcpConfigBackup, plan.mcpConfig);
    if (plan && (skillInstalled || fs.existsSync(skillBackup))) restoreBackup(skillBackup, plan.skillTarget);
    if (mcpInstalled || fs.existsSync(mcpBackup)) restoreBackup(mcpBackup, mcpInstallRoot);
    if (selfTestStarted || selfTestResult || fs.existsSync(credentialsBackup)) restoreBackup(credentialsBackup, credentialsFile);
    timings.totalMs = Date.now() - startedAt;
    const failed = plan
      ? buildState({ manifest, plan, state, mcp: mcpInfo, skill: skillInfo, mcpRoot: mcpInstallRoot, credentialsFile, installRoot, selfTestResult, timings, error: wrapped })
      : { schema: 'fuxi-bootstrap-state/1', bootstrapId: manifest.bootstrapId, status: 'FAILED', step: wrapped.step, statePath: state, installRoot, timings, failure: { code: wrapped.code, message: wrapped.message, step: wrapped.step }, updatedAt: nowIso() };
    writeJsonAtomic(state, failed);
    wrapped.details = { ...wrapped.details, state, recovery: 'Read the state file and use a new bootstrap manifest after correcting the failure.' };
    throw wrapped;
  } finally {
    try { removePath(staging); } finally { unlock(); }
  }
}

function verify(stateFile) {
  const state = readJson(absolute(stateFile, 'state'));
  let configHasFuxi = false;
  if (state.mcpConfig && fs.existsSync(state.mcpConfig)) {
    try {
      const config = readConfig(state.mcpConfig);
      configHasFuxi = Boolean(config.mcpServers && mcpEntryMatchesState(config.mcpServers['fuxi-platform'], state, { apiUrl: state.apiUrl }));
    } catch (error) {}
  }
  const checks = {
    state: state.status === 'COMPLETE',
    mcpServer: Boolean(state.mcpRoot && fs.existsSync(path.join(state.mcpRoot, 'src', 'server.js'))),
    launcher: Boolean(state.mcpRoot && fs.existsSync(path.join(state.mcpRoot, 'src', 'launcher.js'))),
    skill: Boolean(state.skillTarget && fs.existsSync(path.join(state.skillTarget, 'SKILL.md'))),
    config: configHasFuxi
  };
  return { ok: Object.values(checks).every(Boolean), status: checks.state ? 'COMPLETE' : 'FAILED', checks, reloadRequired: state.reloadRequired !== false, postReloadVerified: Boolean(state.postReloadVerified) };
}

function publicError(error) {
  return {
    ok: false,
    status: 'FAILED',
    step: error.step || 'FAILED',
    nextAction: error.nextAction || '根据 error.code 修正问题；不要声称接入成功',
    error: {
      code: error.code || 'BOOTSTRAP_FAILED',
      message: error.message || 'Bootstrap failed',
      ...(error.details || {})
    }
  };
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  try {
    if (parsed.command === 'preflight') {
      const manifest = readManifest(parsed.values.manifest);
      process.stdout.write(`${JSON.stringify({
        ...preflight(manifest, parsed.values),
        step: 'PRECHECK',
        nextAction: '使用同一 manifest 执行 install，并传入已下载 ZIP 的绝对路径'
      }, null, 2)}\n`);
      return 0;
    }
    if (parsed.command === 'install') {
      const manifest = readManifest(parsed.values.manifest);
      const result = await install(manifest, parsed.values);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    if (parsed.command === 'verify') {
      const result = verify(parsed.values.state);
      process.stdout.write(`${JSON.stringify({
        ...result,
        step: 'VERIFY',
        nextAction: result.ok ? '如果 reloadRequired=true，重启或刷新 AI 客户端后再次调用 check_connection({})' : '根据 checks 结果修复安装，再使用新的 bootstrap manifest 重试'
      }, null, 2)}\n`);
      return result.ok ? 0 : 1;
    }
    throw new BootstrapError('USAGE', 'Usage: node bootstrap.js preflight|install --manifest <path> | verify --state <path>');
  } catch (error) {
    process.stdout.write(`${JSON.stringify(publicError(error), null, 2)}\n`);
    return 1;
  } finally {
    if (parsed.values['cleanup-manifest'] && parsed.values.manifest) {
      try { fs.rmSync(absolute(parsed.values.manifest, 'manifest'), { force: true }); } catch (error) {}
    }
  }
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stdout.write(`${JSON.stringify(publicError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  BootstrapError,
  clientTargets,
  preflight,
  extractPackage,
  downloadArtifact,
  mergeMcpConfig,
  mcpEntry,
  acquireBootstrapLock,
  selfTest,
  install,
  verify,
  main
};
