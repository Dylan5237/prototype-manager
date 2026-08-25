const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prepareArtifactBundle,
  commitArtifactBundle,
  getArtifactMetadata,
  artifactFile,
  validateZip
} = require('../services/agent-artifacts');

let tempRoot;
let sourceRoot;

test.beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-agent-artifacts-'));
  sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-agent-sources-'));
  process.env.FUXI_AGENT_RELEASE_ROOT = tempRoot;
  fs.mkdirSync(path.join(sourceRoot, 'mcp', 'src'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'skill'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'mcp', 'src', 'server.js'), '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(sourceRoot, 'mcp', 'package.json'), '{"name":"test-mcp"}\n');
  fs.writeFileSync(path.join(sourceRoot, 'skill', 'SKILL.md'), '---\nname: test-skill\n---\n');
});

test.afterEach(() => {
  delete process.env.FUXI_AGENT_RELEASE_ROOT;
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.rmSync(sourceRoot, { recursive: true, force: true });
});

test('builds immutable MCP and Skill ZIP artifacts with real digests', () => {
  const bundle = prepareArtifactBundle({
    releaseId: 'artifact-test-v1',
    mcpDir: path.join(sourceRoot, 'mcp'),
    skillDir: path.join(sourceRoot, 'skill')
  });
  assert.equal(bundle.artifacts.mcp.size > 0, true);
  assert.equal(bundle.artifacts.skill.size > 0, true);
  assert.equal(bundle.artifacts.mcp.sha256.length, 64);
  assert.equal(bundle.artifacts.skill.sha256.length, 64);
  commitArtifactBundle(bundle);

  const mcp = getArtifactMetadata('artifact-test-v1', 'mcp');
  const skill = getArtifactMetadata('artifact-test-v1', 'skill');
  assert.equal(mcp.sha256, bundle.artifacts.mcp.sha256);
  assert.equal(skill.sha256, bundle.artifacts.skill.sha256);
  assert.equal(fs.existsSync(artifactFile('artifact-test-v1', 'mcp')), true);
  assert.match(validateZip(artifactFile('artifact-test-v1', 'skill'), 'skill').entries.join('\n'), /SKILL\.md$/);
});

test('rejects duplicate immutable artifact release IDs', () => {
  const args = {
    releaseId: 'artifact-test-v2',
    mcpDir: path.join(sourceRoot, 'mcp'),
    skillDir: path.join(sourceRoot, 'skill')
  };
  const first = prepareArtifactBundle(args);
  commitArtifactBundle(first);
  assert.throws(() => prepareArtifactBundle(args), error => error.code === 'ARTIFACT_RELEASE_ALREADY_EXISTS');
});
