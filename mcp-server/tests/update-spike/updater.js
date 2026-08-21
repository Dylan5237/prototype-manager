const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  const walk = (dir, relative = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const child = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) walk(absolute, child);
      else files.push(child.replace(/\\/g, '/'));
    }
  };
  walk(root);
  return files.sort();
}

function sha256Tree(root) {
  const digest = crypto.createHash('sha256');
  for (const relative of listFiles(root)) {
    digest.update(relative);
    digest.update('\0');
    digest.update(fs.readFileSync(path.join(root, relative)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function copyTree(source, target) {
  ensureDir(target);
  fs.cpSync(source, target, { recursive: true });
}

function paths(root) {
  return {
    install: path.join(root, 'install'),
    versions: path.join(root, 'install', 'versions'),
    staging: path.join(root, 'install', 'staging'),
    current: path.join(root, 'install', 'current.json'),
    previous: path.join(root, 'install', 'previous.json'),
    installation: path.join(root, 'install', 'installation.json'),
    pending: path.join(root, 'install', 'pending-update.json'),
    state: path.join(root, 'install', 'update-state.json'),
    lock: path.join(root, 'install', 'update.lock'),
    clientRunning: path.join(root, 'install', 'mcp-running.lock')
  };
}

function acquireLock(file) {
  ensureDir(path.dirname(file));
  let handle;
  try {
    handle = fs.openSync(file, 'wx');
    fs.writeSync(handle, `${process.pid}\n`);
  } catch (error) {
    if (error.code === 'EEXIST') {
      const locked = new Error('本地更新正在执行');
      locked.code = 'UPDATE_LOCKED';
      throw locked;
    }
    throw error;
  }
  return () => {
    try { fs.closeSync(handle); } finally { fs.rmSync(file, { force: true }); }
  };
}

function atomicWriteJson(file, value) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeJson(temp, value);
  fs.renameSync(temp, file);
}

function assertWithin(root, candidate) {
  const base = path.resolve(root) + path.sep;
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(base)) {
    const error = new Error(`路径越界: ${candidate}`);
    error.code = 'PATH_OUTSIDE_INSTALL';
    throw error;
  }
  return resolved;
}

function verifyArtifact(manifest, kind, stagedRoot) {
  const artifact = manifest.artifacts[kind];
  const actual = sha256Tree(stagedRoot);
  if (actual !== artifact.sha256) {
    const error = new Error(`${kind} 摘要不匹配`);
    error.code = 'ARTIFACT_DIGEST_MISMATCH';
    error.details = { expected: artifact.sha256, actual };
    throw error;
  }
  return actual;
}

function smokeCheck(mcpRoot, skillRoot) {
  const server = path.join(mcpRoot, 'src', 'server.js');
  const syntax = spawnSync(process.execPath, ['--check', server], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    const error = new Error(`MCP 语法检查失败: ${(syntax.stderr || syntax.stdout || '').trim()}`);
    error.code = 'UPDATE_SYNTAX_FAILED';
    throw error;
  }

  const smoke = spawnSync(process.execPath, [server, '--smoke'], { encoding: 'utf8' });
  if (smoke.status !== 0 || !(smoke.stdout || '').includes('SMOKE_OK')) {
    const probeInput = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    ].join('\n') + '\n';
    const probe = spawnSync(process.execPath, [server], {
      input: probeInput,
      encoding: 'utf8',
      timeout: 2500,
      killSignal: 'SIGTERM'
    });
    const replies = (probe.stdout || '').split(/\r?\n/).filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    const initialized = replies.some(item => item.id === 1 && item.result && item.result.serverInfo);
    const listed = replies.some(item => item.id === 2 && item.result && Array.isArray(item.result.tools));
    if (!initialized || !listed) {
      const message = [smoke.stderr, smoke.stdout, probe.stderr, probe.stdout]
        .filter(Boolean).join(' ').trim();
      const error = new Error(`MCP Smoke 失败: ${message}`);
      error.code = 'UPDATE_SMOKE_FAILED';
      throw error;
    }
  }

  const skillFile = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillFile) || !fs.readFileSync(skillFile, 'utf8').includes('name:')) {
    const error = new Error('Skill 发现检查失败');
    error.code = 'SKILL_DISCOVERY_FAILED';
    throw error;
  }
}

function applyPendingUpdate(root) {
  const p = paths(root);
  if (!fs.existsSync(p.pending)) return { status: 'NO_PENDING_UPDATE' };

  const release = readJson(p.pending);
  const current = fs.existsSync(p.current) ? readJson(p.current) : null;
  if (current && current.releaseId === release.releaseId) {
    atomicWriteJson(p.state, { status: 'COMPLETED', releaseId: release.releaseId, reason: 'ALREADY_CURRENT' });
    return { status: 'ALREADY_CURRENT', releaseId: release.releaseId };
  }

  const releaseDir = assertWithin(p.versions, path.join(p.versions, release.releaseId));
  const stagingDir = assertWithin(p.staging, path.join(p.staging, `${release.releaseId}-${process.pid}-${Date.now()}`));
  const releaseMcp = path.join(releaseDir, 'mcp');
  const releaseSkill = path.join(releaseDir, 'skill');
  const stagingMcp = path.join(stagingDir, 'mcp');
  const stagingSkill = path.join(stagingDir, 'skill');
  let releaseSwitched = false;
  let unlock = null;
  try {
    unlock = acquireLock(p.lock);
    atomicWriteJson(p.state, { status: 'VERIFYING', releaseId: release.releaseId });
    ensureDir(stagingDir);
    copyTree(release.source.mcp, stagingMcp);
    copyTree(release.source.skill, stagingSkill);
    verifyArtifact(release, 'mcp', stagingMcp);
    verifyArtifact(release, 'skill', stagingSkill);
    smokeCheck(stagingMcp, stagingSkill);

    fs.rmSync(releaseDir, { recursive: true, force: true });
    copyTree(stagingMcp, releaseMcp);
    copyTree(stagingSkill, releaseSkill);
    if (current) atomicWriteJson(p.previous, current);
    ensureDir(path.dirname(p.current));
    atomicWriteJson(p.current, {
      releaseId: release.releaseId,
      mcpVersion: release.mcpVersion,
      skillVersion: release.skillVersion,
      mcpPath: releaseMcp,
      skillPath: releaseSkill
    });
    releaseSwitched = true;
    atomicWriteJson(p.installation, {
      releaseId: release.releaseId,
      mcpVersion: release.mcpVersion,
      skillVersion: release.skillVersion,
      currentFile: p.current,
      previousFile: p.previous
    });
    atomicWriteJson(p.state, { status: 'COMPLETED', releaseId: release.releaseId });
    fs.rmSync(p.pending, { force: true });
    return { status: 'COMPLETED', releaseId: release.releaseId };
  } catch (error) {
    const blocked = error.code === 'UPDATE_LOCKED';
    const status = blocked ? 'WAITING_LOCK' : (current ? 'ROLLED_BACK' : 'FAILED');
    if (releaseSwitched && current) {
      atomicWriteJson(p.current, current);
      atomicWriteJson(p.installation, {
        releaseId: current.releaseId,
        mcpVersion: current.mcpVersion,
        skillVersion: current.skillVersion,
        currentFile: p.current,
        previousFile: p.previous
      });
    }
    atomicWriteJson(p.state, {
      status,
      releaseId: release.releaseId,
      restoredReleaseId: current && current.releaseId,
      errorCode: error.code || 'UPDATE_FAILED',
      message: error.message
    });
    return {
      status,
      releaseId: release.releaseId,
      restoredReleaseId: current && current.releaseId,
      errorCode: error.code || 'UPDATE_FAILED'
    };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    if (unlock) unlock();
  }
}

module.exports = {
  applyPendingUpdate,
  paths,
  readJson,
  sha256Tree,
  writeJson
};
