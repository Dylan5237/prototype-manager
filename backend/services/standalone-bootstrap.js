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
  if (/[\r\n"'`]/.test(text)) throw new Error('Onboarding command contains an unsafe argument');
  return `"${text}"`;
}

function assertSha256(value, label) {
  if (!/^[a-f0-9]{64}$/i.test(String(value || ''))) throw new Error(`${label} must be a SHA-256 digest`);
  return String(value).toLowerCase();
}

function assertUrl(value, label) {
  const parsed = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} must use HTTP(S)`);
  return parsed.toString();
}

// Session-specific orchestration layer. It binds the selected Host and the
// short-lived Bootstrap credential, then delegates installation to bootstrap.js.
function buildOnboardingScript({ bootstrapUrl, bootstrapSha256, sessionEndpoint, session, client }) {
  const config = {
    bootstrapUrl: assertUrl(bootstrapUrl, 'bootstrapUrl'),
    bootstrapSha256: assertSha256(bootstrapSha256, 'bootstrapSha256'),
    sessionEndpoint: assertUrl(sessionEndpoint, 'sessionEndpoint'),
    session: String(session || ''),
    client: String(client || '').trim().toLowerCase()
  };
  if (!config.session || !config.client || config.client === 'auto') {
    throw new Error('Onboarding script requires a bound session and deterministic client');
  }
  return `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const config = ${JSON.stringify(config)};
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 15000;
const BACKOFF_MS = 250;
function failure(code, message, retryable = false) { const error = new Error(message || code); error.code = code; error.retryable = retryable; return error; }
function isRetryable(error) { return Boolean(error && (error.retryable || error.name === 'TypeError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function downloadStandalone() {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(config.bootstrapUrl, { signal: controller.signal });
      if (!response.ok) {
        const status = response.status;
        throw failure('BOOTSTRAP_DOWNLOAD_HTTP_' + status, 'Bootstrap download failed with HTTP ' + status, status === 408 || status === 429 || status >= 500);
      }
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 100 * 1024 * 1024) throw failure('BOOTSTRAP_ARTIFACT_TOO_LARGE', 'Bootstrap artifact exceeds 100 MiB');
      return data;
    } catch (error) {
      lastError = error.name === 'AbortError' ? failure('BOOTSTRAP_DOWNLOAD_TIMEOUT', 'Bootstrap download timed out', true) : error;
      if (!isRetryable(lastError) || attempt === MAX_ATTEMPTS) throw lastError;
      await sleep(BACKOFF_MS * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
async function run() {
  if (Number(process.versions.node.split('.')[0]) < 18) throw failure('NODE_VERSION_UNSUPPORTED', 'Node.js >= 18 is required');
  const data = await downloadStandalone();
  const actualSha = crypto.createHash('sha256').update(data).digest('hex');
  if (actualSha !== config.bootstrapSha256) throw failure('BOOTSTRAP_DIGEST_MISMATCH', 'Bootstrap SHA-256 mismatch');
  const file = path.join(os.tmpdir(), 'fuxi-bootstrap-' + crypto.randomUUID() + '.cjs');
  try { fs.writeFileSync(file, data, { mode: 0o700 }); }
  catch (error) { throw failure('BOOTSTRAP_WRITE_FAILED', error.message); }
  try {
    const child = spawn(process.execPath, [file, 'connect', '--session', config.session, '--endpoint', config.sessionEndpoint, '--client', config.client], { stdio: 'inherit', env: process.env });
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', error => reject(failure('BOOTSTRAP_SPAWN_FAILED', error.message)));
      child.once('close', code => resolve(code === null ? 1 : code));
    });
    process.exitCode = exitCode;
  } finally {
    try { fs.rmSync(file, { force: true }); } catch (error) {}
  }
}
run().catch(error => {
  process.stdout.write(JSON.stringify({ ok: false, status: 'FAILED', step: 'LOAD', error: { code: error.code || 'ONBOARDING_FAILED', message: error.message || 'Onboarding failed' } }) + '\\n');
  process.exitCode = 1;
});
`;
}

// The only shell-visible layer: download, verify and execute the short-lived
// onboarding script. Child output and exit status pass through unchanged.
function renderOnboardingLauncherCommand({ onboardingUrl, onboardingSha256 }) {
  const url = assertUrl(onboardingUrl, 'onboardingUrl');
  const digest = assertSha256(onboardingSha256, 'onboardingSha256');
  const loaderSource = `if(Number(process.versions.node.split('.')[0])<18){process.stdout.write(JSON.stringify({ok:false,status:'FAILED',step:'LOAD',error:{code:'NODE_VERSION_UNSUPPORTED',message:'Node.js >= 18 is required'}})+'\\n');process.exitCode=1}else{
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const [url,sha]=process.argv.slice(1),MAX=3,TIMEOUT=15000;
const fail=(code,message,retryable=false)=>Object.assign(new Error(message||code),{code,retryable});
const retryable=e=>Boolean(e&&(e.retryable||e.name==='TypeError'||e.code==='ECONNRESET'||e.code==='ETIMEDOUT'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function download(){let last;for(let attempt=1;attempt<=MAX;attempt++){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw fail('ONBOARDING_DOWNLOAD_HTTP_'+response.status,'Onboarding script download failed with HTTP '+response.status,response.status===408||response.status===429||response.status>=500);const data=Buffer.from(await response.arrayBuffer());if(data.length>1024*1024)throw fail('ONBOARDING_SCRIPT_TOO_LARGE','Onboarding script exceeds 1 MiB');return data}catch(error){last=error.name==='AbortError'?fail('ONBOARDING_DOWNLOAD_TIMEOUT','Onboarding script download timed out',true):error;if(!retryable(last)||attempt===MAX)throw last;await sleep(250*attempt)}finally{clearTimeout(timer)}}throw last}
async function run(){const data=await download();if(crypto.createHash('sha256').update(data).digest('hex')!==sha)throw fail('ONBOARDING_DIGEST_MISMATCH','Onboarding script SHA-256 mismatch');const file=path.join(os.tmpdir(),'fuxi-onboard-'+crypto.randomUUID()+'.cjs');try{try{fs.writeFileSync(file,data,{mode:0o700})}catch(error){throw fail('ONBOARDING_WRITE_FAILED',error.message)}const child=spawn(process.execPath,[file],{stdio:'inherit',env:process.env});const code=await new Promise((resolve,reject)=>{child.once('error',error=>reject(fail('ONBOARDING_SPAWN_FAILED',error.message)));child.once('close',value=>resolve(value===null?1:value))});process.exitCode=code}finally{try{fs.rmSync(file,{force:true})}catch(error){}}}
run().catch(error=>{process.stdout.write(JSON.stringify({ok:false,status:'FAILED',step:'LOAD',error:{code:error.code||'ONBOARDING_LAUNCHER_FAILED',message:error.message||'Onboarding launcher failed'}})+'\\n');process.exitCode=1})}`;
  const encodedSource = Buffer.from(loaderSource, 'utf8').toString('base64');
  return `node -e "eval(Buffer.from('${encodedSource}','base64').toString())" -- ${quoteCommandArg(url)} ${quoteCommandArg(digest)}`;
}

module.exports = { buildStandaloneBootstrap, buildOnboardingScript, renderOnboardingLauncherCommand, sha256 };
