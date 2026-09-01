#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { spawn } = require('node:child_process');

const apiUrl = (argumentValue('--api-url', process.env.FUXI_API_URL || 'http://192.168.2.145:16077')).replace(/\/+$/, '');
const iterations = Math.max(1, Number(argumentValue('--iterations', '10')) || 10);
const outputPath = path.resolve(argumentValue('--output', path.join(__dirname, '..', '..', '..', '.release', 'phase24-16077-baseline.json')));
const mcpServer = path.resolve(__dirname, '..', '..', 'src', 'server.js');

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(samples) {
  const passed = samples.filter(sample => sample.ok).map(sample => sample.ms);
  return {
    sampleCount: samples.length,
    passed: passed.length,
    failures: samples.length - passed.length,
    p50Ms: passed.length ? percentile(passed, 0.5) : null,
    p95Ms: passed.length ? percentile(passed, 0.95) : null,
    maxMs: passed.length ? Math.max(...passed) : null
  };
}

async function timed(label, fn) {
  const started = performance.now();
  try {
    const value = await fn();
    return { label, ok: true, ms: Number((performance.now() - started).toFixed(2)), value };
  } catch (error) {
    return { label, ok: false, ms: Number((performance.now() - started).toFixed(2)), error: { code: error.code || 'REQUEST_FAILED', message: error.message } };
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success === false) {
    const error = new Error((body && body.message) || `HTTP ${response.status}`);
    error.code = (body && body.code) || `HTTP_${response.status}`;
    throw error;
  }
  return body;
}

function mcpCheckConnection(credentialsFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mcpServer], {
      cwd: path.dirname(mcpServer),
      env: { ...process.env, FUXI_API_URL: apiUrl, FUXI_CREDENTIALS_FILE: credentialsFile },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const replies = [];
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill('SIGTERM');
      if (error) reject(error);
      else resolve(value);
    };
    const timeout = setTimeout(() => {
      const error = new Error('MCP check_connection timed out');
      error.code = 'MCP_TIMEOUT';
      finish(error);
    }, 10000);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      for (const line of stdout.split(/\r?\n/).slice(0, -1)) {
        try { replies.push(JSON.parse(line)); } catch (error) {}
      }
      stdout = stdout.split(/\r?\n/).at(-1) || '';
      const toolReply = replies.find(item => item.id === 2);
      if (toolReply) {
        if (toolReply.error) {
          const error = new Error(toolReply.error.message || 'MCP tool failed');
          error.code = toolReply.error.code || 'MCP_TOOL_FAILED';
          finish(error);
        } else {
          finish(null, toolReply.result);
        }
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => finish(error));
    child.on('exit', code => {
      if (!settled && code !== 0) {
        const error = new Error(`MCP exited with code ${code}: ${stderr.slice(0, 200)}`);
        error.code = 'MCP_PROCESS_FAILED';
        finish(error);
      }
    });
    child.stdin.end([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_connection', arguments: {} } })
    ].join('\n') + '\n');
  });
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-phase24-16077-'));
  const credentialsFile = path.join(tempRoot, 'mcp-credentials.json');
  try {
    const login = await fetchJson(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.FUXI_USERNAME, password: process.env.FUXI_PASSWORD })
    });
    const headers = { Authorization: `Bearer ${login.data.token}` };
    const projectResponse = await fetchJson(`${apiUrl}/api/projects?scope=all&page=1&pageSize=12`, { headers });
    const projectId = projectResponse.data?.[0]?.id || null;

    const measurements = { health: [], projectList: [], projectDetail: [], prototypeList: [], mcpCheckConnection: [] };
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      const health = await timed('health', () => fetchJson(`${apiUrl}/api/health`));
      measurements.health.push({ iteration, ...health });
      const projectList = await timed('projectList', () => fetchJson(`${apiUrl}/api/projects?scope=all&page=1&pageSize=12`, { headers }));
      measurements.projectList.push({ iteration, ...projectList });
      const prototypeList = await timed('prototypeList', () => fetchJson(`${apiUrl}/api/prototypes?scope=all&page=1&pageSize=20`, { headers }));
      measurements.prototypeList.push({ iteration, ...prototypeList });
      if (projectId) {
        const detail = await timed('projectDetail', () => fetchJson(`${apiUrl}/api/projects/${encodeURIComponent(projectId)}`, { headers }));
        measurements.projectDetail.push({ iteration, ...detail });
      }
      const mcp = await timed('mcpCheckConnection', () => mcpCheckConnection(credentialsFile));
      measurements.mcpCheckConnection.push({ iteration, ...mcp });
    }

    const report = {
      schema: 'fuxi-phase24-16077-baseline/1',
      generatedAt: new Date().toISOString(),
      target: apiUrl,
      environment: { platform: process.platform, arch: process.arch, node: process.version, iterations, authenticatedUserId: login.data.user.id },
      summaries: Object.fromEntries(Object.entries(measurements).map(([label, samples]) => [label, summarize(samples)])),
      measurements,
      unverifiedChains: [
        'AI 原型生成需求解析、profile 选择、构建、截图质量与修复轮次',
        '16077 写入型上传、服务端解压、版本写入和回读一致性',
        'Skill/MCP 更新下载、切换、heartbeat 与回滚压力'
      ],
      notes: [
        'MCP check_connection includes the runtime heartbeat request when credentials are provided.',
        'This is a test-environment baseline, not a production acceptance or optimization claim.'
      ]
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ status: 'PASS', output: outputPath, target: apiUrl, iterations, summaries: report.summaries }, null, 2)}\n`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`${error.code || 'BASELINE_FAILED'}: ${error.message}\n`);
  process.exitCode = 1;
});
