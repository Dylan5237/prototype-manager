const fs = require('fs');
const path = require('path');

function readSource(file) {
  return fs.readFileSync(path.resolve(file), 'utf8').replace(/^#![^\r\n]*(?:\r?\n|$)/, '');
}

// 将现有安装器及其两个无依赖模块封装成单文件脚本；不改变 MCP 运行时 ZIP。
function buildStandaloneBootstrap({ mcpRoot }) {
  const root = path.resolve(mcpRoot);
  const sources = {
    './fuxi-zip': readSource(path.join(root, 'src', 'fuxi-zip.js')),
    './local-lock': readSource(path.join(root, 'src', 'local-lock.js')),
    './bootstrap': readSource(path.join(root, 'src', 'bootstrap.js'))
  };
  return `#!/usr/bin/env node\n'use strict';\n\nconst nativeRequire = require;\nconst moduleSources = ${JSON.stringify(sources)};\nconst moduleCache = new Map();\n\nfunction loadModule(id) {\n  if (!Object.prototype.hasOwnProperty.call(moduleSources, id)) return nativeRequire(id);\n  if (moduleCache.has(id)) return moduleCache.get(id).exports;\n  const module = { exports: {}, filename: __filename };\n  moduleCache.set(id, module);\n  const localRequire = dependency => {\n    if (Object.prototype.hasOwnProperty.call(moduleSources, dependency)) return loadModule(dependency);\n    return nativeRequire(dependency);\n  };\n  new Function('require', 'module', 'exports', moduleSources[id])(localRequire, module, module.exports);\n  return module.exports;\n}\n\nconst bootstrap = loadModule('./bootstrap');\nbootstrap.main(process.argv.slice(2)).then(code => {\n  process.exitCode = code;\n}).catch(error => {\n  process.stdout.write(JSON.stringify({\n    ok: false,\n    status: 'FAILED',\n    step: 'FAILED',\n    error: { code: error.code || 'BOOTSTRAP_FAILED', message: error.message || 'Bootstrap failed' }\n  }) + '\\n');\n  process.exitCode = 1;\n});\n`;
}

function sha256(value) {
  return require('crypto').createHash('sha256').update(value).digest('hex');
}

function quoteCommandArg(value) {
  const text = String(value);
  if (/[\r\n"'`]/.test(text)) throw new Error('Bootstrap command contains an unsafe argument');
  return `"${text}"`;
}

function renderCanonicalBootstrapCommand({ bootstrapUrl, sessionEndpoint, bootstrapSha256, session, client = 'auto' }) {
  const loaderSource = `const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 15000;
const BACKOFF_MS = 250;
const [bootstrapUrl, expectedSha, sessionEndpoint, command, sessionFlag, session, clientFlag, client] = process.argv.slice(1);
function failure(code, retryable = false) { const error = new Error(code); error.code = code; error.retryable = retryable; return error; }
function isRetryable(error) { return Boolean(error && (error.retryable || error.name === 'TypeError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function downloadStandalone() {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(bootstrapUrl, { signal: controller.signal });
      if (!response.ok) {
        const status = response.status;
        throw failure('BOOTSTRAP_DOWNLOAD_HTTP_' + status, status === 408 || status === 429 || status >= 500);
      }
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 100 * 1024 * 1024) throw failure('BOOTSTRAP_ARTIFACT_TOO_LARGE');
      return data;
    } catch (error) {
      lastError = error.name === 'AbortError' ? failure('BOOTSTRAP_DOWNLOAD_TIMEOUT', true) : error;
      if (!isRetryable(lastError) || attempt === MAX_ATTEMPTS) throw lastError;
      await sleep(BACKOFF_MS * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
async function run() {
  if (!bootstrapUrl || !/^[a-f0-9]{64}$/i.test(expectedSha || '') || !sessionEndpoint || command !== 'connect' || sessionFlag !== '--session' || !session || clientFlag !== '--client' || !client) throw failure('BOOTSTRAP_ARGUMENTS_INVALID');
  const data = await downloadStandalone();
  const actualSha = crypto.createHash('sha256').update(data).digest('hex');
  if (actualSha !== expectedSha.toLowerCase()) throw failure('BOOTSTRAP_DIGEST_MISMATCH');
  const file = path.join(os.tmpdir(), 'fuxi-bootstrap-' + crypto.randomUUID() + '.cjs');
  fs.writeFileSync(file, data, { mode: 0o700 });
  try {
    const child = spawn(process.execPath, [file, command, sessionFlag, session, '--endpoint', sessionEndpoint, clientFlag, client], { stdio: 'inherit', env: process.env });
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code === null ? 1 : code)); });
    process.exitCode = exitCode;
  } finally {
    try { fs.rmSync(file, { force: true }); } catch (error) {}
  }
}
run().catch(error => {
  process.stdout.write(JSON.stringify({ ok: false, status: 'FAILED', step: 'LOAD', error: { code: error.code || 'BOOTSTRAP_LOADER_FAILED', message: 'Bootstrap loader failed' } }) + '\\n');
  process.exitCode = 1;
});`;
  const encodedSource = Buffer.from(loaderSource, 'utf8').toString('base64');
  return `node -e "eval(Buffer.from('${encodedSource}','base64').toString())" -- ${[
    bootstrapUrl,
    bootstrapSha256,
    sessionEndpoint
  ].map(quoteCommandArg).join(' ')} connect --session ${quoteCommandArg(session)} --client ${quoteCommandArg(client)}`;
}

module.exports = { buildStandaloneBootstrap, renderCanonicalBootstrapCommand, sha256 };
