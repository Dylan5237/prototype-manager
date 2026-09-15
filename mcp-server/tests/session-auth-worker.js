#!/usr/bin/env node
const { getSessionAuth } = require('../src/update-runtime');

getSessionAuth({
  apiUrl: process.env.FUXI_API_URL,
  credentialsFile: process.env.FUXI_CREDENTIALS_FILE,
  deviceLabel: process.env.FUXI_DEVICE_LABEL || 'session-auth-worker'
}).then(auth => {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    token: auth && auth.token,
    sessionId: auth && auth.sessionId
  })}\n`);
}).catch(error => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    code: error.code || 'WORKER_FAILED',
    message: error.message
  })}\n`);
  process.exitCode = 1;
});
