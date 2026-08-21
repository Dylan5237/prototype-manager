#!/usr/bin/env node

const os = require('os');
const path = require('path');
const {
  prepareStartup,
  startMcp,
  reportReadyUpdate
} = require('./update-runtime');

async function main() {
  const apiUrl = (process.env.FUXI_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const credentialsFile = process.env.FUXI_CREDENTIALS_FILE || path.join(os.homedir(), '.fuxi', 'mcp-credentials.json');
  const installRoot = process.env.FUXI_INSTALL_ROOT || path.join(os.homedir(), '.fuxi', 'agent-runtime');
  const startup = await prepareStartup({
    apiUrl,
    credentialsFile,
    installRoot,
    deviceLabel: `${os.hostname()} (${process.platform})`
  });

  if (!startup.current) {
    process.stderr.write('[fuxi-update] no current MCP installation; set FUXI_MCP_TARGET for first migration\n');
    process.exitCode = 1;
    return;
  }

  if (startup.update && startup.update.status === 'ROLLED_BACK') {
    process.stderr.write(`[fuxi-update] rolled back ${startup.update.releaseId}: ${startup.update.errorCode || 'UPDATE_FAILED'}\n`);
  }

  let child;
  try {
    child = startMcp(startup.p, startup.current);
  } catch (error) {
    process.stderr.write(`[fuxi-update] MCP start failed: ${error.code || error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (startup.update && startup.update.status === 'READY_TO_START') {
    try {
      await reportReadyUpdate(startup, child, apiUrl);
    } catch (error) {
      // 本地版本已经完成安全切换；结果回报失败不污染 MCP stdout，也不阻断当前进程。
      process.stderr.write(`[fuxi-update] completed result report failed: ${error.code || error.message}\n`);
    }
  }

  child.on('error', error => {
    process.stderr.write(`[fuxi-update] MCP process failed: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = typeof code === 'number' ? code : 1;
    if (signal) process.stderr.write(`[fuxi-update] MCP exited by ${signal}\n`);
  });
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`[fuxi-update] launcher failed: ${error.code || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
