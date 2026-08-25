const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startAgent } = require('./launcher');
const { applyPendingUpdate, paths, readJson, sha256Tree, writeJson } = require('./updater');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function write(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

function createRelease(root, releaseId, options = {}) {
  const release = path.join(root, 'releases', releaseId);
  const mcp = path.join(release, 'mcp');
  const skill = path.join(release, 'skill');
  const smokeBody = options.smokeFail
    ? "if (process.argv.includes('--smoke')) process.exit(2);\n"
    : "if (process.argv.includes('--smoke')) console.log('SMOKE_OK');\n";
  write(path.join(mcp, 'src', 'server.js'), `#!/usr/bin/env node\n${smokeBody}`);
  write(path.join(skill, 'SKILL.md'), `---\nname: ${releaseId}-skill\n---\n\n# ${releaseId}\n`);
  return {
    releaseId,
    mcpVersion: options.mcpVersion || releaseId,
    skillVersion: options.skillVersion || releaseId,
    source: { mcp, skill },
    artifacts: { mcp: { sha256: sha256Tree(mcp) }, skill: { sha256: sha256Tree(skill) } }
  };
}

function seedInstall(root, release) {
  const p = paths(root);
  ensureDir(p.install);
  ensureDir(path.join(p.versions, release.releaseId, 'mcp'));
  ensureDir(path.join(p.versions, release.releaseId, 'skill'));
  fs.cpSync(release.source.mcp, path.join(p.versions, release.releaseId, 'mcp'), { recursive: true });
  fs.cpSync(release.source.skill, path.join(p.versions, release.releaseId, 'skill'), { recursive: true });
  const current = {
    releaseId: release.releaseId,
    mcpVersion: release.mcpVersion,
    skillVersion: release.skillVersion,
    mcpPath: path.join(p.versions, release.releaseId, 'mcp'),
    skillPath: path.join(p.versions, release.releaseId, 'skill')
  };
  writeJson(p.current, current);
  writeJson(p.installation, { ...current, currentFile: p.current, previousFile: p.previous });
  write(path.join(p.install, 'credentials.json'), 'refresh-token-hash-only-demo');
  return { ...p, credentialHash: sha256Tree(p.install) };
}

function schedule(p, release) {
  writeJson(p.pending, { ...release, requestedAt: new Date().toISOString(), requestedBy: 'browser-confirmation' });
}

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-update-spike-'));
  try {
    const v1 = createRelease(root, 'v1', { mcpVersion: '1.0.0', skillVersion: '1.0.0' });
    const v2 = createRelease(root, 'v2', { mcpVersion: '2.0.0', skillVersion: '2.0.0' });
    const badDigest = createRelease(root, 'bad-digest', { mcpVersion: '2.1.0', skillVersion: '2.1.0' });
    badDigest.artifacts.mcp.sha256 = crypto.createHash('sha256').update('wrong').digest('hex');
    const badSmoke = createRelease(root, 'bad-smoke', { mcpVersion: '2.2.0', skillVersion: '2.2.0', smokeFail: true });
    const seeded = seedInstall(root, v1);
    const credentialsBefore = fs.readFileSync(path.join(seeded.install, 'credentials.json'), 'utf8');

    schedule(seeded, v2);
    const waiting = startAgent(root);
    assert.strictEqual(waiting.update.status, 'COMPLETED');
    assert.strictEqual(waiting.currentReleaseId, 'v2');
    assert.strictEqual(waiting.mcpVersion, '2.0.0');
    assert.strictEqual(fs.readFileSync(path.join(seeded.install, 'credentials.json'), 'utf8'), credentialsBefore);
    assert.strictEqual(readJson(seeded.previous).releaseId, 'v1');

    schedule(seeded, badDigest);
    const digestFailure = startAgent(root);
    assert.strictEqual(digestFailure.update.status, 'ROLLED_BACK');
    assert.strictEqual(digestFailure.update.errorCode, 'ARTIFACT_DIGEST_MISMATCH');
    assert.strictEqual(readJson(seeded.current).releaseId, 'v2');

    schedule(seeded, badSmoke);
    const smokeFailure = startAgent(root);
    assert.strictEqual(smokeFailure.update.status, 'ROLLED_BACK');
    assert.strictEqual(smokeFailure.update.errorCode, 'UPDATE_SMOKE_FAILED');
    assert.strictEqual(readJson(seeded.current).releaseId, 'v2');

    schedule(seeded, v2);
    write(seeded.clientRunning, 'simulated-ai-client');
    const running = startAgent(root);
    assert.strictEqual(running.status, 'WAITING_FOR_CLIENT_EXIT');
    assert.ok(fs.existsSync(seeded.pending));
    fs.rmSync(seeded.clientRunning, { force: true });
    const resumed = startAgent(root);
    assert.strictEqual(resumed.update.status, 'ALREADY_CURRENT');

    schedule(seeded, badSmoke);
    write(seeded.lock, 'simulated-other-updater');
    const locked = applyPendingUpdate(root);
    assert.strictEqual(locked.status, 'WAITING_LOCK');
    assert.strictEqual(locked.errorCode, 'UPDATE_LOCKED');
    fs.rmSync(seeded.lock, { force: true });

    const state = readJson(seeded.state);
    const evidence = {
      root,
      deferredStart: 'browser-confirmation -> pending-update.json -> next launcher start',
      success: { releaseId: 'v2', credentialsPreserved: true },
      digestFailure: { status: digestFailure.update.status, errorCode: digestFailure.update.errorCode },
      smokeFailure: { status: smokeFailure.update.status, errorCode: smokeFailure.update.errorCode },
      runningClient: running.status,
      concurrentUpdater: { status: locked.status, errorCode: locked.errorCode },
      finalState: state.status,
      currentRelease: readJson(seeded.current).releaseId
    };
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run();
