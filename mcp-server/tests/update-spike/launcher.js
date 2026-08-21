const fs = require('fs');
const path = require('path');
const { applyPendingUpdate, paths, readJson } = require('./updater');

function startAgent(root) {
  const p = paths(root);
  if (fs.existsSync(p.clientRunning)) {
    return { status: 'WAITING_FOR_CLIENT_EXIT', reason: 'MCP 客户端仍在运行' };
  }

  const update = applyPendingUpdate(root);
  const current = fs.existsSync(p.current) ? readJson(p.current) : null;
  return {
    status: 'STARTED',
    update,
    currentReleaseId: current && current.releaseId,
    mcpVersion: current && current.mcpVersion,
    skillVersion: current && current.skillVersion
  };
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || process.cwd());
  process.stdout.write(`${JSON.stringify(startAgent(root), null, 2)}\n`);
}

module.exports = { startAgent };
