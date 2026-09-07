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
  const loaderSource = `const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const {spawn}=require('node:child_process');const [bootstrapUrl,expectedSha,sessionEndpoint,command,sessionFlag,session,clientFlag,client]=process.argv.slice(1);const fail=(code)=>{const e=new Error(code);e.code=code;throw e;};async function run(){if(!bootstrapUrl||!expectedSha||!sessionEndpoint||command!=='connect'||sessionFlag!=='--session'||!session||clientFlag!=='--client'||!client)fail('BOOTSTRAP_ARGUMENTS_INVALID');const response=await fetch(bootstrapUrl);if(!response.ok)fail('BOOTSTRAP_DOWNLOAD_HTTP_'+response.status);const data=Buffer.from(await response.arrayBuffer());const actualSha=crypto.createHash('sha256').update(data).digest('hex');if(actualSha!==expectedSha.toLowerCase())fail('BOOTSTRAP_DIGEST_MISMATCH');const file=path.join(os.tmpdir(),'fuxi-bootstrap-'+crypto.randomUUID()+'.cjs');fs.writeFileSync(file,data,{mode:0o700});try{const child=spawn(process.execPath,[file,command,sessionFlag,session,'--endpoint',sessionEndpoint,clientFlag,client],{stdio:'inherit',env:process.env});const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code===null?1:code));});if(exitCode)process.exitCode=exitCode;}finally{try{fs.rmSync(file,{force:true});}catch(error){}}}run().catch(error=>{process.stdout.write(JSON.stringify({ok:false,status:'FAILED',step:'LOAD',error:{code:error.code||'BOOTSTRAP_LOADER_FAILED',message:'Bootstrap loader failed'}})+'\\n');process.exitCode=1;});`;
  const encodedSource = Buffer.from(loaderSource, 'utf8').toString('base64');
  return `node -e "eval(Buffer.from('${encodedSource}','base64').toString())" -- ${[
    bootstrapUrl,
    bootstrapSha256,
    sessionEndpoint
  ].map(quoteCommandArg).join(' ')} connect --session ${quoteCommandArg(session)} --client ${quoteCommandArg(client)}`;
}

module.exports = { buildStandaloneBootstrap, renderCanonicalBootstrapCommand, sha256 };
