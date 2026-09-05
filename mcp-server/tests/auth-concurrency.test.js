const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function waitForExit(child) {
  return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
  });
}

function createMcpProcess(apiUrl, credentialsFile) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      FUXI_API_URL: apiUrl,
      FUXI_CREDENTIALS_FILE: credentialsFile,
      FUXI_TOKEN: '',
      FUXI_CONNECT_CODE: '',
      FUXI_USERNAME: '',
      FUXI_PASSWORD: ''
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let buffer = '';
  const replies = new Map();
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = replies.get(message.id);
      if (waiter) {
        replies.delete(message.id);
        waiter(message);
      }
    }
  });
  return {
    child,
    send(method, params = {}) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return new Promise(resolve => replies.set(id, resolve));
    },
    close() {
      child.kill('SIGTERM');
      return waitForExit(child);
    }
  };
}

test('server loads credentials before check_connection and single-flights concurrent refresh', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-auth-concurrency-'));
  let server;
  let refreshCalls = 0;
  let validRefreshToken = 'initial-refresh-token';
  try {
    server = http.createServer(async (req, res) => {
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { status: 'ok' } }));
        return;
      }
      if (req.url === '/api/auth/mcp/refresh') {
        const body = await readBody(req);
        refreshCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 80));
        if (body.refreshToken !== validRefreshToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, code: 'INVALID_REFRESH_TOKEN' }));
          return;
        }
        validRefreshToken = `next-refresh-token-${refreshCalls}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            accessToken: 'access-token',
            refreshToken: validRefreshToken,
            sessionId: 'session-1',
            expiresIn: 3600,
            sessionExpiresAt: new Date(Date.now() + 3600000).toISOString()
          }
        }));
        return;
      }
      if (req.url === '/api/auth/mcp/heartbeat') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { session: {}, updates: [] } }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const apiUrl = `http://127.0.0.1:${server.address().port}`;
    const credentialsFile = path.join(root, 'mcp-credentials.json');
    fs.writeFileSync(credentialsFile, JSON.stringify({
      apiUrl,
      refreshToken: 'initial-refresh-token',
      sessionId: 'session-1'
    }));

    const mcp = createMcpProcess(apiUrl, credentialsFile);
    try {
      await mcp.send('initialize', { protocolVersion: '2024-11-05' });
      const first = mcp.send('tools/call', { name: 'check_connection', arguments: {} });
      const second = mcp.send('tools/call', { name: 'check_connection', arguments: {} });
      const [firstReply, secondReply] = await Promise.all([first, second]);
      const values = [firstReply, secondReply].map(reply => JSON.parse(reply.result.content[0].text));
      assert.equal(refreshCalls, 1);
      assert.deepEqual(values.map(value => value.authentication), ['verified', 'verified']);
    } finally {
      await mcp.close();
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('separate MCP processes serialize rotating refresh tokens through the credential lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-process-lock-'));
  let server;
  let refreshCalls = 0;
  let validRefreshToken = 'initial-refresh-token';
  try {
    server = http.createServer(async (req, res) => {
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { status: 'ok' } }));
        return;
      }
      if (req.url === '/api/auth/mcp/refresh') {
        const body = await readBody(req);
        refreshCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 80));
        if (body.refreshToken !== validRefreshToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, code: 'INVALID_REFRESH_TOKEN' }));
          return;
        }
        validRefreshToken = `rotated-refresh-token-${refreshCalls}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            accessToken: `access-token-${refreshCalls}`,
            refreshToken: validRefreshToken,
            sessionId: 'session-1',
            expiresIn: 3600,
            sessionExpiresAt: new Date(Date.now() + 3600000).toISOString()
          }
        }));
        return;
      }
      if (req.url === '/api/auth/mcp/heartbeat') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { session: {}, updates: [] } }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const apiUrl = `http://127.0.0.1:${server.address().port}`;
    const credentialsFile = path.join(root, 'mcp-credentials.json');
    fs.writeFileSync(credentialsFile, JSON.stringify({
      apiUrl,
      refreshToken: 'initial-refresh-token',
      sessionId: 'session-1'
    }));

    const first = createMcpProcess(apiUrl, credentialsFile);
    const second = createMcpProcess(apiUrl, credentialsFile);
    try {
      await Promise.all([
        first.send('initialize', { protocolVersion: '2024-11-05' }),
        second.send('initialize', { protocolVersion: '2024-11-05' })
      ]);
      const [firstReply, secondReply] = await Promise.all([
        first.send('tools/call', { name: 'check_connection', arguments: {} }),
        second.send('tools/call', { name: 'check_connection', arguments: {} })
      ]);
      const values = [firstReply, secondReply].map(reply => JSON.parse(reply.result.content[0].text));
      assert.equal(refreshCalls, 2);
      assert.deepEqual(values.map(value => value.authentication), ['verified', 'verified']);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
