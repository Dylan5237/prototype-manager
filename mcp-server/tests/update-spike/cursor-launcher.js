const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { applyPendingUpdate, paths, readJson } = require('./updater');

const targetMcp = process.env.FUXI_MCP_TARGET || path.resolve(__dirname, '../../src/server.js');
const updateRoot = process.env.FUXI_UPDATE_ROOT || '';

function selectMcpTarget() {
  if (!updateRoot) return targetMcp;
  const p = paths(updateRoot);
  if (fs.existsSync(p.pending)) {
    const result = applyPendingUpdate(updateRoot);
    process.stderr.write(`[fuxi-update-spike] ${JSON.stringify(result)}\n`);
  }
  if (fs.existsSync(p.current)) {
    const current = readJson(p.current);
    if (current.mcpPath && fs.existsSync(path.join(current.mcpPath, 'src', 'server.js'))) {
      return path.join(current.mcpPath, 'src', 'server.js');
    }
  }
  return targetMcp;
}

const child = spawn(process.execPath, [selectMcpTarget()], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', error => {
  process.stderr.write(`[fuxi-update-spike] launcher failed: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : 1;
  if (signal) process.stderr.write(`[fuxi-update-spike] MCP exited by ${signal}\n`);
});
