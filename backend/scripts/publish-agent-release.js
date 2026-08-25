#!/usr/bin/env node

const path = require('path');
const { initDatabase, closeDatabase } = require('../database/db');
const { findUserByUsername } = require('../services/db-users');
const { createRelease } = require('../services/db-agent-updates');
const {
  prepareArtifactBundle,
  commitArtifactBundle,
  discardArtifactBundle,
  removeArtifactBundle
} = require('../services/agent-artifacts');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

async function main() {
  const releaseId = arg('release-id', process.env.FUXI_AGENT_RELEASE_ID);
  const mcpVersion = arg('mcp-version', process.env.FUXI_AGENT_MCP_VERSION || '0.2.0');
  const skillVersion = arg('skill-version', process.env.FUXI_AGENT_SKILL_VERSION || '0.2.0');
  const actorUsername = arg('actor', process.env.FUXI_AGENT_ACTOR || 'wushengzhi');
  const baseUrl = (arg('base-url', process.env.FUXI_PUBLIC_BASE_URL || '')).replace(/\/+$/, '');
  if (!releaseId || !baseUrl) throw new Error('release-id 和 base-url 必填');

  await initDatabase();
  let bundle = null;
  let committed = false;
  try {
    const actor = findUserByUsername(actorUsername);
    if (!actor) throw new Error(`发布人不存在: ${actorUsername}`);
    const mcpDir = path.resolve(process.env.FUXI_MCP_DIR || path.join(__dirname, '../../mcp-server'));
    const skillDir = path.resolve(process.env.FUXI_SKILL_DIR || path.join(__dirname, '../../../../skills/prototype-manager-skills/fuxi-prototype'));
    bundle = prepareArtifactBundle({ releaseId, mcpDir, skillDir });
    const manifest = {
      releaseId,
      channel: 'stable',
      mcpVersion,
      skillVersion,
      apiSchemaVersion: '1',
      minNodeVersion: '18.0.0',
      artifacts: {
        mcp: {
          url: `${baseUrl}/api/integrations/agent-releases/${releaseId}/mcp.zip`,
          size: bundle.artifacts.mcp.size,
          sha256: bundle.artifacts.mcp.sha256
        },
        skill: {
          url: `${baseUrl}/api/integrations/agent-releases/${releaseId}/skill.zip`,
          size: bundle.artifacts.skill.size,
          sha256: bundle.artifacts.skill.sha256
        }
      }
    };
    commitArtifactBundle(bundle);
    committed = true;
    const release = createRelease({ actorUserId: actor.id, manifest });
    process.stdout.write(`${JSON.stringify({ releaseId: release.releaseId, mcpVersion, skillVersion, artifacts: release.manifest.artifacts })}\n`);
  } catch (error) {
    if (bundle) {
      if (committed) removeArtifactBundle(bundle.releaseId);
      else discardArtifactBundle(bundle);
    }
    throw error;
  } finally {
    closeDatabase();
  }
}

main().catch(error => {
  process.stderr.write(`publish-agent-release failed: ${error.code || error.message}\n`);
  process.exitCode = 1;
});
