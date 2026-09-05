const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { parseZipBuffer } = require('./fuxi-zip');
const { acquireFileLock, acquireFileLockSync } = require('./local-lock');

const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const FORBIDDEN_SEGMENTS = new Set([
  '.git', '.svn', '.hg', 'node_modules', '.npmrc', '.env',
  '.credentials.json', 'credentials.json', 'mcp-credentials.json',
  'tests', '__tests__', 'coverage', 'logs', 'uploads', 'repos'
]);

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

function paths(root = process.env.FUXI_INSTALL_ROOT || path.join(os.homedir(), '.fuxi', 'agent-runtime')) {
  const resolved = path.resolve(root);
  return {
    root: resolved,
    install: path.join(resolved, 'install'),
    versions: path.join(resolved, 'install', 'versions'),
    staging: path.join(resolved, 'install', 'staging'),
    current: path.join(resolved, 'install', 'current.json'),
    previous: path.join(resolved, 'install', 'previous.json'),
    installation: path.join(resolved, 'install', 'installation.json'),
    state: path.join(resolved, 'install', 'update-state.json'),
    lock: path.join(resolved, 'install', 'update.lock')
  };
}

function skillTarget() {
  return process.env.FUXI_SKILL_TARGET
    || process.env.FUXI_CANONICAL_SKILL_TARGET
    || path.join(os.homedir(), '.cursor', 'skills', 'fuxi-prototype');
}

function legacySkillTarget() {
  return process.env.FUXI_LEGACY_SKILL_TARGET
    || path.join(os.homedir(), '.cursor', 'skills', 'fuxi-skyui-prototype');
}

function assertWithin(root, candidate) {
  const base = path.resolve(root) + path.sep;
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(base)) {
    const error = new Error('更新路径越界');
    error.code = 'PATH_OUTSIDE_INSTALL';
    throw error;
  }
  return resolved;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function acquireLock(lockFile) {
  return acquireFileLockSync(lockFile, {
    errorCode: 'UPDATE_LOCKED',
    message: '本地更新正在执行'
  });
}

function safeEntry(entryName) {
  const normalized = String(entryName || '').replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length || normalized.startsWith('/') || segments.some(part => part === '..' || part === '.')) {
    const error = new Error(`ZIP 条目路径不安全: ${entryName}`);
    error.code = 'ARTIFACT_UNSAFE_PATH';
    throw error;
  }
  if (segments.some(part => FORBIDDEN_SEGMENTS.has(part) || part.endsWith('.log'))) {
    const error = new Error(`ZIP 包含禁止文件: ${entryName}`);
    error.code = 'ARTIFACT_FORBIDDEN_ENTRY';
    throw error;
  }
  return segments.join('/');
}

function extractZip(zipFile, targetRoot) {
  const parsed = parseZipBuffer(fs.readFileSync(zipFile));
  ensureDir(targetRoot);
  let fileCount = 0;
  for (const entry of parsed.entries) {
    const entryName = safeEntry(entry.name);
    if (!entry.decompressed || entryName.endsWith('/')) continue;
    const target = assertWithin(targetRoot, path.join(targetRoot, ...entryName.split('/')));
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, entry.decompressed);
    fileCount += 1;
  }
  if (!fileCount) {
    const error = new Error('更新 ZIP 为空');
    error.code = 'ARTIFACT_EMPTY';
    throw error;
  }
  return targetRoot;
}

function packageRoot(root, expectedDir) {
  const wrapped = path.join(root, expectedDir);
  return fs.existsSync(wrapped) ? wrapped : root;
}

function requestUrl(apiUrl, value) {
  try {
    return new URL(value, `${apiUrl.replace(/\/+$/, '')}/`);
  } catch (error) {
    const wrapped = new Error('更新制品 URL 无效');
    wrapped.code = 'ARTIFACT_URL_INVALID';
    throw wrapped;
  }
}

async function downloadArtifact({ apiUrl, token, artifact, targetFile }) {
  const url = requestUrl(apiUrl, artifact.url);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const error = new Error(`更新制品下载失败: HTTP ${response.status}`);
    error.code = 'ARTIFACT_DOWNLOAD_FAILED';
    throw error;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ARTIFACT_BYTES) {
    const error = new Error('更新制品超过大小限制');
    error.code = 'ARTIFACT_TOO_LARGE';
    throw error;
  }
  const actual = crypto.createHash('sha256').update(buffer).digest('hex');
  if (actual !== String(artifact.sha256 || '').toLowerCase()) {
    const error = new Error('更新制品 SHA-256 不匹配');
    error.code = 'ARTIFACT_DIGEST_MISMATCH';
    throw error;
  }
  if (artifact.size !== undefined && artifact.size !== null && Number(artifact.size) !== buffer.length) {
    const error = new Error('更新制品大小不匹配');
    error.code = 'ARTIFACT_SIZE_MISMATCH';
    throw error;
  }
  ensureDir(path.dirname(targetFile));
  const temp = `${targetFile}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, buffer);
  fs.renameSync(temp, targetFile);
  return { path: targetFile, size: buffer.length, sha256: actual };
}

function smokeCheck(mcpRoot, skillRoot) {
  const server = path.join(mcpRoot, 'src', 'server.js');
  if (!fs.existsSync(server)) {
    const error = new Error('MCP 入口不存在');
    error.code = 'MCP_ENTRY_MISSING';
    throw error;
  }
  const syntax = spawnSync(process.execPath, ['--check', server], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    const error = new Error('MCP 语法检查失败');
    error.code = 'UPDATE_SYNTAX_FAILED';
    throw error;
  }
  const input = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  ].join('\n') + '\n';
  const probe = spawnSync(process.execPath, [server], {
    input,
    encoding: 'utf8',
    timeout: 2500,
    killSignal: 'SIGTERM'
  });
  const replies = (probe.stdout || '').split(/\r?\n/).filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch (error) { return []; }
  });
  if (!replies.some(item => item.id === 1 && item.result && item.result.serverInfo) ||
      !replies.some(item => item.id === 2 && item.result && Array.isArray(item.result.tools))) {
    const error = new Error('MCP Smoke 检查失败');
    error.code = 'UPDATE_SMOKE_FAILED';
    throw error;
  }
  const skillFile = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillFile) || !/^---[\s\S]*?name\s*:/m.test(fs.readFileSync(skillFile, 'utf8'))) {
    const error = new Error('Skill 发现检查失败');
    error.code = 'SKILL_DISCOVERY_FAILED';
    throw error;
  }
}

function copyTree(source, target) {
  ensureDir(path.dirname(target));
  fs.cpSync(source, target, { recursive: true });
}

function replaceTree(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  copyTree(source, target);
}

function readCredentials(credentialsFile) {
  try {
    const credentials = readJson(credentialsFile);
    if (!credentials || !credentials.refreshToken || !credentials.sessionId) return null;
    return credentials;
  } catch (error) {
    return null;
  }
}

function writeCredentials(credentialsFile, credentials) {
  const temp = `${credentialsFile}.tmp-${process.pid}-${Date.now()}`;
  ensureDir(path.dirname(credentialsFile));
  fs.writeFileSync(temp, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, credentialsFile);
}

async function getSessionAuth({ apiUrl, credentialsFile, deviceLabel }) {
  const unlock = await acquireFileLock(`${credentialsFile}.refresh.lock`, {
    errorCode: 'AUTHENTICATION_BUSY',
    message: '设备会话正在由另一个 MCP 进程刷新，请稍后重试'
  });
  try {
    const credentials = readCredentials(credentialsFile);
    const token = process.env.FUXI_TOKEN || '';
    if (token && credentials) {
      return {
        token,
        sessionId: credentials.sessionId,
        accessExpiresAt: Number(process.env.FUXI_ACCESS_EXPIRES_AT || 0),
        credentials
      };
    }
    if (!credentials) return null;
    const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/auth/mcp/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: credentials.refreshToken, deviceLabel })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.success === false) {
      const error = new Error('设备会话刷新失败');
      error.code = response.status === 401 ? 'AUTHENTICATION_FAILED' : 'SESSION_REFRESH_FAILED';
      throw error;
    }
    const data = body.data || {};
    const next = {
      ...credentials,
      apiUrl,
      refreshToken: data.refreshToken,
      sessionId: data.sessionId || credentials.sessionId,
      sessionExpiresAt: data.sessionExpiresAt || credentials.sessionExpiresAt || null,
      deviceLabel,
      updatedAt: nowIso()
    };
    writeCredentials(credentialsFile, next);
    return {
      token: data.accessToken,
      sessionId: next.sessionId,
      accessExpiresAt: data.expiresAt ? Date.parse(data.expiresAt) : Date.now() + Number(data.expiresIn || 0) * 1000,
      credentials: next
    };
  } finally {
    unlock();
  }
}

async function claimUpdate({ apiUrl, token, sessionId }) {
  const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/integrations/update-intents/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success === false) {
    const error = new Error((body && body.message) || `更新领取失败: HTTP ${response.status}`);
    error.code = (body && body.code) || 'UPDATE_CLAIM_FAILED';
    throw error;
  }
  return body.data;
}

async function reportUpdateResult({ apiUrl, token, intentId, status, localMcpVersion, localSkillVersion, errorCode, errorMessage }) {
  if (!intentId) return null;
  const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/integrations/update-intents/${encodeURIComponent(intentId)}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, localMcpVersion, localSkillVersion, errorCode, errorMessage })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success === false) {
    const error = new Error((body && body.message) || `更新结果回报失败: HTTP ${response.status}`);
    error.code = (body && body.code) || 'UPDATE_RESULT_FAILED';
    throw error;
  }
  return body.data;
}

async function reportSessionRuntime({ apiUrl, token, sessionId, mcpVersion, skillVersion, runtimeVersion = process.version, platform = process.platform }) {
  if (!token || !sessionId) return null;
  const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/auth/mcp/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, mcpVersion, skillVersion, runtimeVersion, platform })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success === false) {
    const error = new Error((body && body.message) || `运行时版本回报失败: HTTP ${response.status}`);
    error.code = (body && body.code) || 'RUNTIME_REPORT_FAILED';
    throw error;
  }
  return body.data;
}

function updateState(p, value) {
  writeJsonAtomic(p.state, { ...value, updatedAt: nowIso() });
}

function currentRelease(p) {
  return fs.existsSync(p.current) ? readJson(p.current) : null;
}

function restorePrevious(p) {
  if (!fs.existsSync(p.previous)) return null;
  const previous = readJson(p.previous);
  const target = process.env.FUXI_SKILL_TARGET || previous.skillTarget || skillTarget();
  if (target && previous.skillPath && fs.existsSync(previous.skillPath)) {
    replaceTree(previous.skillPath, target);
  }
  writeJsonAtomic(p.current, previous);
  writeJsonAtomic(p.installation, {
    releaseId: previous.releaseId,
    mcpVersion: previous.mcpVersion,
    skillVersion: previous.skillVersion,
    currentFile: p.current,
    previousFile: p.previous
  });
  return previous;
}

async function applyRelease({ p, apiUrl, token, intent, manifest }) {
  const releaseId = String(manifest.releaseId || '').trim();
  if (!releaseId) throw Object.assign(new Error('发布版本缺少 releaseId'), { code: 'INVALID_RELEASE_MANIFEST' });
  const current = currentRelease(p);
  if (current && current.releaseId === releaseId) {
    updateState(p, { status: 'COMPLETED', releaseId, reason: 'ALREADY_CURRENT' });
    await reportUpdateResult({ apiUrl, token, intentId: intent.id, status: 'completed', localMcpVersion: manifest.mcpVersion, localSkillVersion: manifest.skillVersion });
    return { status: 'ALREADY_CURRENT', releaseId, current };
  }

  let unlock;
  let switched = false;
  let skillReplaced = false;
  const targetSkillDir = skillTarget();
  const legacyTargetDir = legacySkillTarget();
  const shouldMigrateLegacy = !process.env.FUXI_SKILL_TARGET
    && !fs.existsSync(targetSkillDir)
    && fs.existsSync(legacyTargetDir);
  const runId = `${releaseId}-${process.pid}-${Date.now()}`;
  const staging = assertWithin(p.staging, path.join(p.staging, runId));
  try {
    unlock = acquireLock(p.lock);
    updateState(p, { status: 'VERIFYING', releaseId });
    const stagingMcp = path.join(staging, 'mcp.zip');
    const stagingSkill = path.join(staging, 'skill.zip');
    await Promise.all([
      downloadArtifact({ apiUrl, token, artifact: manifest.artifacts.mcp, targetFile: stagingMcp }),
      downloadArtifact({ apiUrl, token, artifact: manifest.artifacts.skill, targetFile: stagingSkill })
    ]);
    const unpackRoot = ensureDir(path.join(staging, 'unpacked'));
    const mcpPackage = packageRoot(extractZip(stagingMcp, path.join(unpackRoot, 'mcp')), 'fuxi-platform-mcp');
    const skillPackage = packageRoot(extractZip(stagingSkill, path.join(unpackRoot, 'skill')), 'fuxi-prototype');
    smokeCheck(mcpPackage, skillPackage);
    const previousSkillBackup = path.join(staging, 'previous-skill');
    const legacySkillBackup = path.join(staging, 'legacy-skill');
    if (shouldMigrateLegacy) copyTree(legacyTargetDir, legacySkillBackup);
    if (fs.existsSync(targetSkillDir)) copyTree(targetSkillDir, previousSkillBackup);
    replaceTree(skillPackage, targetSkillDir);
    skillReplaced = true;
    if (shouldMigrateLegacy) fs.rmSync(legacyTargetDir, { recursive: true, force: true });

    const versionDir = assertWithin(p.versions, path.join(p.versions, releaseId));
    fs.rmSync(versionDir, { recursive: true, force: true });
    ensureDir(versionDir);
    copyTree(mcpPackage, path.join(versionDir, 'mcp'));
    copyTree(skillPackage, path.join(versionDir, 'skill'));
    const next = {
      releaseId,
      mcpVersion: String(manifest.mcpVersion),
      skillVersion: String(manifest.skillVersion),
      mcpPath: path.join(versionDir, 'mcp'),
      skillPath: path.join(versionDir, 'skill'),
      skillTarget: targetSkillDir
    };
    if (current) writeJsonAtomic(p.previous, current);
    writeJsonAtomic(p.current, next);
    switched = true;
    writeJsonAtomic(p.installation, {
      releaseId,
      mcpVersion: next.mcpVersion,
      skillVersion: next.skillVersion,
      currentFile: p.current,
      previousFile: p.previous
    });
    updateState(p, { status: 'READY_TO_START', releaseId });
    return { status: 'READY_TO_START', releaseId, current: next, previous: current };
  } catch (error) {
    if (skillReplaced) {
      const previousSkillBackup = path.join(staging, 'previous-skill');
      if (fs.existsSync(previousSkillBackup)) replaceTree(previousSkillBackup, targetSkillDir);
      else fs.rmSync(targetSkillDir, { recursive: true, force: true });
      const legacySkillBackup = path.join(staging, 'legacy-skill');
      if (shouldMigrateLegacy && fs.existsSync(legacySkillBackup)) replaceTree(legacySkillBackup, legacyTargetDir);
    }
    if (switched && current) restorePrevious(p);
    const restored = current || null;
    updateState(p, {
      status: restored ? 'ROLLED_BACK' : 'FAILED',
      releaseId,
      restoredReleaseId: restored && restored.releaseId,
      errorCode: error.code || 'UPDATE_FAILED',
      errorMessage: error.message
    });
    try {
      await reportUpdateResult({
        apiUrl,
        token,
        intentId: intent.id,
        status: restored ? 'rolled_back' : 'failed',
        localMcpVersion: restored && restored.mcpVersion,
        localSkillVersion: restored && restored.skillVersion,
        errorCode: error.code || 'UPDATE_FAILED',
        errorMessage: error.message
      });
    } catch (reportError) {
      process.stderr.write(`[fuxi-update] result report failed: ${reportError.code || reportError.message}\n`);
    }
    return { status: restored ? 'ROLLED_BACK' : 'FAILED', releaseId, restoredReleaseId: restored && restored.releaseId, errorCode: error.code || 'UPDATE_FAILED' };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    if (unlock) unlock();
  }
}

function resolveCurrentTarget(p) {
  const current = currentRelease(p);
  if (current && current.mcpPath && fs.existsSync(path.join(current.mcpPath, 'src', 'server.js'))) return current;
  const fallback = process.env.FUXI_MCP_TARGET;
  if (fallback && fs.existsSync(path.resolve(fallback))) {
    const mcpPath = path.dirname(path.dirname(path.resolve(fallback)));
    let mcpVersion = 'unknown';
    try { mcpVersion = readJson(path.join(mcpPath, 'package.json')).version || 'unknown'; } catch (error) {}
    return {
      releaseId: 'legacy',
      mcpVersion,
      skillVersion: process.env.FUXI_SKILL_VERSION || 'unknown',
      mcpPath,
      skillPath: skillTarget(),
      skillTarget: skillTarget()
    };
  }
  return null;
}

function startMcp(p, current, auth = null) {
  if (!current || !current.mcpPath) {
    const error = new Error('没有可启动的 MCP 版本');
    error.code = 'MCP_CURRENT_MISSING';
    throw error;
  }
  const server = path.join(current.mcpPath, 'src', 'server.js');
  if (!fs.existsSync(server)) {
    const error = new Error('current 指向的 MCP 入口不存在');
    error.code = 'MCP_CURRENT_MISSING';
    throw error;
  }
  const env = {
    ...process.env,
    FUXI_SKILL_VERSION: current.skillVersion || 'unknown',
    FUXI_SKILL_TARGET: current.skillTarget || skillTarget(),
    FUXI_MCP_VERSION: current.mcpVersion || 'unknown',
    FUXI_INSTALL_ROOT: p.root
  };
  if (auth && auth.token) {
    env.FUXI_TOKEN = auth.token;
    if (auth.accessExpiresAt) env.FUXI_ACCESS_EXPIRES_AT = String(auth.accessExpiresAt);
  }
  return spawn(process.execPath, [server], { stdio: 'inherit', env });
}

async function prepareStartup({ apiUrl, credentialsFile, installRoot, deviceLabel }) {
  const p = paths(installRoot);
  ensureDir(p.install);
  let auth = null;
  try {
    auth = await getSessionAuth({ apiUrl, credentialsFile, deviceLabel });
  } catch (error) {
    process.stderr.write(`[fuxi-update] session refresh skipped: ${error.code || error.message}\n`);
    return { p, update: null, current: resolveCurrentTarget(p), auth: null };
  }
  if (!auth || !auth.sessionId) return { p, update: null, current: resolveCurrentTarget(p), auth: null };
  try {
    const claimed = await claimUpdate({ apiUrl, token: auth.token, sessionId: auth.sessionId });
    if (!claimed.claimed || !claimed.intent || !claimed.intent.release || !claimed.intent.release.manifest) {
      return { p, update: null, current: resolveCurrentTarget(p), auth };
    }
    const intent = claimed.intent;
    const update = await applyRelease({ p, apiUrl, token: auth.token, intent, manifest: intent.release.manifest });
    return { p, update: { ...update, intentId: intent.id, manifest: intent.release.manifest, token: auth.token }, current: update.current || resolveCurrentTarget(p), auth };
  } catch (error) {
    process.stderr.write(`[fuxi-update] startup update skipped: ${error.code || error.message}\n`);
    return { p, update: null, current: resolveCurrentTarget(p), auth };
  }
}

async function reportReadyUpdate(startup, child, apiUrl = process.env.FUXI_API_URL) {
  const update = startup.update;
  if (!update || !update.intentId || update.status !== 'READY_TO_START' || !startup.auth) return;
  await reportUpdateResult({
    apiUrl,
    token: update.token || startup.auth.token,
    intentId: update.intentId,
    status: 'completed',
    localMcpVersion: update.manifest.mcpVersion,
    localSkillVersion: update.manifest.skillVersion
  });
  updateState(startup.p, { status: 'COMPLETED', releaseId: update.releaseId });
  if (child && child.pid) process.stderr.write(`[fuxi-update] completed ${update.releaseId}\n`);
}

module.exports = {
  paths,
  readJson,
  sha256File,
  extractZip,
  downloadArtifact,
  getSessionAuth,
  claimUpdate,
  reportUpdateResult,
  reportSessionRuntime,
  applyRelease,
  prepareStartup,
  resolveCurrentTarget,
  startMcp,
  reportReadyUpdate,
  restorePrevious
};
