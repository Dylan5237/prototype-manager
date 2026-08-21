#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const mcpRoot = path.resolve(__dirname, '..');
const { validateProject, validateZipFile, packProject, parseZipBuffer } = require(path.join(mcpRoot, 'src', 'fuxi-zip'));
const platformRoot = path.resolve(mcpRoot, '..');
const backendRoot = path.join(platformRoot, 'backend');
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const AdmZip = backendRequire('adm-zip');
const jwt = backendRequire('jsonwebtoken');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(apiUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Backend exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for isolated Fuxi backend');
}

function startMcp(env) {
  const child = spawn(process.execPath, [path.join(mcpRoot, 'src', 'server.js')], {
    cwd: mcpRoot,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let buffer = '';
  let id = 0;
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });
  child.on('exit', code => {
    for (const waiter of pending.values()) waiter.reject(new Error(`MCP exited with code ${code}`));
    pending.clear();
  });
  return {
    child,
    send(method, params = {}) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
      });
    }
  };
}

function parseTool(response) {
  assert.ifError(response.error);
  assert(response.result && response.result.content, 'Expected MCP tool content');
  return { result: response.result, body: JSON.parse(response.result.content[0].text) };
}

async function callTool(client, name, args = {}) {
  const response = await client.send('tools/call', { name, arguments: args });
  if (response.result && response.result.isError) {
    throw new Error(`${name} failed: ${response.result.content[0].text}`);
  }
  return parseTool(response);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise(resolve => {
    child.once('exit', resolve);
    setTimeout(resolve, 2000);
  });
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-mcp-integration-'));
  const isolatedBackend = path.join(tempRoot, 'backend');
  const zipPath = path.join(tempRoot, 'prototype.zip');
  const secondZipPath = path.join(tempRoot, 'prototype-v2.zip');
  let backend;
  let mcp;
  let tokenMcp;
  let invalidMcp;
  let expiredMcp;
  let failMcp;
  let secondMcp;
  let codeMcp;
  let revokedMcp;

  try {
    fs.cpSync(backendRoot, isolatedBackend, {
      recursive: true,
      filter(source) {
        const relative = path.relative(backendRoot, source);
        if (!relative) return true;
        const first = relative.split(path.sep)[0];
        return !['node_modules', 'data', 'repos', 'uploads'].includes(first) &&
          !['backend.log', 'server.log', 'app.db'].includes(relative);
      }
    });
    for (const name of ['data', 'repos', 'uploads']) {
      fs.mkdirSync(path.join(isolatedBackend, name), { recursive: true });
    }

    const zip = new AdmZip();
    zip.addFile('index.html', Buffer.from('<!doctype html><html><head><title>MCP Test</title></head><body>Fuxi MCP integration</body></html>'));
    zip.addFile('README.md', Buffer.from('# MCP Integration Fixture\n\nprototype_spec: test\nruntime: static-html\n'));
    zip.writeZip(zipPath);
    const secondZip = new AdmZip();
    secondZip.addFile('index.html', Buffer.from('<!doctype html><html><head><title>MCP Test v2</title></head><body>Fuxi MCP integration v2</body></html>'));
    secondZip.addFile('README.md', Buffer.from('# MCP Integration Fixture v2\n\nprototype_spec: test\nruntime: static-html\n'));
    secondZip.writeZip(secondZipPath);

    const projectRoot = path.join(tempRoot, 'fixture-project');
    fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'dist', 'index.html'), '<!doctype html><html><head><title>Local</title></head><body><script src="./assets/app.js"></script></body></html>');
    fs.mkdirSync(path.join(projectRoot, 'dist', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'dist', 'assets', 'app.js'), 'console.log("ok")');
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Local Fixture\n\n' + 'x'.repeat(64));
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'node_modules', 'bad.js'), '');
    const packedZip = path.join(tempRoot, 'packed.zip');
    const packed = packProject(projectRoot, packedZip);
    assert.equal(packed.ok, true);
    assert.equal(packed.entryFile, 'index.html');
    assert(!packed.includedFiles.includes('node_modules/bad.js'));

    const projectValidation = validateProject(projectRoot);
    assert.equal(projectValidation.ok, true);
    assert.equal(projectValidation.entryFile, 'index.html');
    assert(!projectValidation.files.included.includes('node_modules/bad.js'));
    const zipValidation = validateZipFile(packedZip);
    assert.equal(zipValidation.ok, true);
    assert.equal(zipValidation.entryFile, 'index.html');
    const packedEntries = parseZipBuffer(fs.readFileSync(packedZip)).entries;
    assert(packedEntries.some(e => e.name === 'index.html'));
    assert(packedEntries.some(e => e.name === 'README.md'));
    assert(packedEntries.some(e => e.name === 'assets/app.js'));

    const distributedSkillDir = path.join(tempRoot, 'fuxi-skyui-prototype');
    fs.mkdirSync(path.join(distributedSkillDir, 'references'), { recursive: true });
    fs.mkdirSync(path.join(distributedSkillDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(distributedSkillDir, 'SKILL.md'), '# Fuxi SkyUI Prototype\n');
    fs.writeFileSync(path.join(distributedSkillDir, 'references', 'workflow.md'), '# Workflow\n');
    fs.writeFileSync(path.join(distributedSkillDir, '.npmrc'), 'secret=must-not-ship\n');
    fs.writeFileSync(path.join(distributedSkillDir, 'node_modules', 'ignored.js'), '');

    const port = await getFreePort();
    const apiUrl = `http://127.0.0.1:${port}`;
    backend = spawn(process.execPath, [path.join(isolatedBackend, 'server.js')], {
      cwd: isolatedBackend,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_PATH: path.join(backendRoot, 'node_modules'),
        JWT_SECRET: 'integration-test-secret',
        FUXI_SKILL_DIR: distributedSkillDir,
        FUXI_MCP_DIR: mcpRoot
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForHealth(apiUrl, backend);

    mcp = startMcp({
      FUXI_API_URL: apiUrl,
      FUXI_USERNAME: 'admin',
      FUXI_PASSWORD: 'admin123',
      FUXI_TOKEN: ''
    });
    const initialized = await mcp.send('initialize', { protocolVersion: '2024-11-05' });
    assert.equal(initialized.result.serverInfo.name, 'fuxi-platform-mcp-server');
    const listedTools = await mcp.send('tools/list');
    assert.equal(listedTools.result.tools.length, 26);
    for (const toolName of ['create_change_handoff', 'redeem_change_handoff', 'get_change_status', 'submit_change_candidate']) {
      assert(listedTools.result.tools.some(tool => tool.name === toolName), `missing ${toolName}`);
    }

    const health = await callTool(mcp, 'check_connection');
    assert.equal(health.body.health.status, 'ok');
    const emptyList = await callTool(mcp, 'list_prototypes', { scope: 'my' });
    assert.deepEqual(emptyList.body.data, []);

    const rounded = await callTool(mcp, 'validate_zip', { zipPath: packedZip });
    assert.equal(rounded.body.ok, true);
    const projectTool = await callTool(mcp, 'validate_project', { projectPath: projectRoot });
    assert.equal(projectTool.body.ok, true);
    const packedProject = await callTool(mcp, 'pack_project', { projectPath: projectRoot, outputZipPath: path.join(tempRoot, 'packed-by-mcp.zip') });
    assert.equal(packedProject.body.ok, true);
    assert.equal(packedProject.body.entryFile, 'index.html');

    // upload_project exercise: create prototype, upload v1, then upload v2 via upload_project
    const uploadTarget = await callTool(mcp, 'create_prototype', { name: 'MCP packed upload fixture' });
    assert.equal(uploadTarget.body.fields.prototypeId, uploadTarget.body.data.id);
    const firstUpload = await callTool(mcp, 'upload_zip', {
      prototypeId: uploadTarget.body.data.id,
      zipPath: packedZip,
      versionNote: 'First upload',
      versionType: 'minor'
    });
    assert.equal(firstUpload.body.data.entry_file, 'index.html');
    const uploadProjectResult = await callTool(mcp, 'upload_project', {
      prototypeId: uploadTarget.body.data.id,
      zipPath: packedZip,
      versionNote: 'Upload from pack_project',
      versionType: 'minor'
    });
    assert.equal(uploadProjectResult.body.affectedScope, 'target-prototype-only');
    assert.equal(uploadProjectResult.body.entryFile, 'index.html');
    assert(uploadProjectResult.body.version);
    assert.equal(uploadProjectResult.body.fields.prototypeId, uploadTarget.body.data.id);
    assert.equal(uploadProjectResult.body.fields.entryFile, 'index.html');
    assert(uploadProjectResult.body.fields.versionNumber >= 1);
    const detailAfter = await callTool(mcp, 'get_prototype', { prototypeId: uploadTarget.body.data.id });
    assert.equal(detailAfter.body.data.entry_file, 'index.html');

    const deliveredCreate = await callTool(mcp, 'deliver_project', {
      mode: 'create',
      idempotencyKey: 'integration-create-0001',
      name: 'MCP safe delivery create',
      zipPath: packedZip,
      versionNote: 'Safe create delivery',
      versionType: 'minor'
    });
    assert.equal(deliveredCreate.body.status, 'COMPLETE');
    assert.equal(deliveredCreate.body.versionBefore, null);
    assert.equal(deliveredCreate.body.affectedScope, 'target-prototype-only');
    const deliveredCreateReplay = await callTool(mcp, 'deliver_project', {
      mode: 'create',
      idempotencyKey: 'integration-create-0001',
      name: 'MCP safe delivery create',
      zipPath: packedZip,
      versionNote: 'Safe create delivery',
      versionType: 'minor'
    });
    assert.equal(deliveredCreateReplay.body.prototypeId, deliveredCreate.body.prototypeId);
    assert.equal(deliveredCreateReplay.body.idempotentReplay, true);
    const idempotencyConflictResponse = await mcp.send('tools/call', {
      name: 'deliver_project',
      arguments: {
        mode: 'create', idempotencyKey: 'integration-create-0001', name: 'Different payload',
        zipPath: packedZip, versionNote: 'Must conflict'
      }
    });
    const idempotencyConflict = parseTool(idempotencyConflictResponse);
    assert.equal(idempotencyConflict.result.isError, true);
    assert.equal(idempotencyConflict.body.error.code, 'IDEMPOTENCY_CONFLICT');

    const deliveredUpdate = await callTool(mcp, 'deliver_project', {
      mode: 'update',
      idempotencyKey: 'integration-update-0001',
      prototypeId: uploadTarget.body.data.id,
      expectedVersion: detailAfter.body.fields.versionNumber,
      expectedEntryFile: 'index.html',
      zipPath: packedZip,
      versionNote: 'Safe update delivery',
      versionType: 'patch'
    });
    assert(deliveredUpdate.body.versionAfter > deliveredUpdate.body.versionBefore);
    const staleVersionResponse = await mcp.send('tools/call', {
      name: 'deliver_project',
      arguments: {
        mode: 'update', idempotencyKey: 'integration-update-stale', prototypeId: uploadTarget.body.data.id,
        expectedVersion: deliveredUpdate.body.versionBefore, zipPath: packedZip, versionNote: 'Must stop'
      }
    });
    const staleVersion = parseTool(staleVersionResponse);
    assert.equal(staleVersion.result.isError, true);
    assert.equal(staleVersion.body.error.code, 'VERSION_CONFLICT');
    const missingTargetResponse = await mcp.send('tools/call', {
      name: 'deliver_project',
      arguments: { mode: 'update', idempotencyKey: 'integration-missing-target', zipPath: packedZip, versionNote: 'Must stop' }
    });
    const missingTarget = parseTool(missingTargetResponse);
    assert.equal(missingTarget.result.isError, true);
    assert.equal(missingTarget.body.error.code, 'INVALID_REQUEST');

    const loginResponse = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const login = await loginResponse.json();
    assert.equal(loginResponse.status, 200);
    const bootstrapResponse = await fetch(`${apiUrl}/api/integrations/agent-bootstrap`, {
      headers: { Authorization: `Bearer ${login.data.token}` }
    });
    const bootstrap = await bootstrapResponse.json();
    assert.equal(bootstrapResponse.status, 200);
    assert.equal(bootstrap.data.skillName, 'fuxi-skyui-prototype');
    assert(bootstrap.data.prompt.includes('check_connection'));
    assert(bootstrap.data.prompt.includes('deliver_project'));
    assert(bootstrap.data.prompt.includes('AI 客户端原生'));
    assert(bootstrap.data.prompt.includes('AUTHORIZATION_REQUIRED'));
    assert(bootstrap.data.prompt.includes('AUTHENTICATION_FAILED'));
    assert(!bootstrap.data.prompt.includes('admin123'));
    assert(bootstrap.data.connectCode);
    assert(bootstrap.data.connectCodeExpiresAt);
    const connectCodeRemainingMs = Date.parse(bootstrap.data.connectCodeExpiresAt) - Date.now();
    assert(connectCodeRemainingMs > 18 * 60 * 1000 && connectCodeRemainingMs <= 20 * 60 * 1000 + 5000);
    assert(bootstrap.data.prompt.includes('FUXI_CONNECT_CODE'));
    assert(bootstrap.data.prompt.includes('FUXI_CREDENTIALS_FILE'));
    assert(bootstrap.data.prompt.indexOf('优先调用 check_connection') < bootstrap.data.prompt.indexOf('使用安装 token 下载 Skill ZIP'));

    // 一次性连接码兑换 access + refresh token，并登记设备会话
    const connectResponse = await fetch(`${apiUrl}/api/auth/mcp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: bootstrap.data.connectCode, deviceLabel: 'integration-test-device' })
    });
    const connected = await connectResponse.json();
    assert.equal(connectResponse.status, 200);
    assert(connected.data.accessToken);
    assert(connected.data.refreshToken);
    assert.equal(connected.data.expiresIn, 3600);
    assert(connected.data.sessionId);
    assert(connected.data.sessionExpiresAt);

    // 连接码是单次使用
    const reusedConnectResponse = await fetch(`${apiUrl}/api/auth/mcp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: bootstrap.data.connectCode })
    });
    assert.equal(reusedConnectResponse.status, 409);
    const reusedConnect = await reusedConnectResponse.json();
    assert.equal(reusedConnect.code, 'CODE_ALREADY_USED');

    // connect 返回的 access token 可直接用于 MCP 调用
    const accessMcp = startMcp({ FUXI_API_URL: apiUrl, FUXI_TOKEN: connected.data.accessToken });
    const accessList = await callTool(accessMcp, 'list_prototypes', { scope: 'my' });
    assert(Array.isArray(accessList.body.data));
    await stop(accessMcp.child);

    // 凭据文件持久化 + 重启后 refresh token 自动换新 access token 并轮换
    const credentialsFile = path.join(tempRoot, 'mcp-credentials.json');
    fs.writeFileSync(credentialsFile, JSON.stringify({
      apiUrl,
      refreshToken: connected.data.refreshToken,
      sessionId: connected.data.sessionId,
      sessionExpiresAt: connected.data.sessionExpiresAt
    }));
    codeMcp = startMcp({
      FUXI_API_URL: apiUrl,
      FUXI_CREDENTIALS_FILE: credentialsFile,
      FUXI_TOKEN: '',
      FUXI_USERNAME: '',
      FUXI_PASSWORD: ''
    });
    const restoredList = await callTool(codeMcp, 'list_prototypes', { scope: 'my' });
    assert(Array.isArray(restoredList.body.data));
    const persisted = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
    assert(persisted.refreshToken);
    assert.notEqual(persisted.refreshToken, connected.data.refreshToken);

    // 连接情况查询：admin 能看到新登记的设备会话
    const sessionsResponse = await fetch(`${apiUrl}/api/auth/mcp/sessions`, {
      headers: { Authorization: `Bearer ${login.data.token}` }
    });
    const sessions = await sessionsResponse.json();
    assert.equal(sessionsResponse.status, 200);
    assert(sessions.data.some(s => s.id === connected.data.sessionId));

    // 撤销会话后，refresh token 立即失效
    const revokeResponse = await fetch(`${apiUrl}/api/auth/mcp/sessions/${connected.data.sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${login.data.token}` }
    });
    assert.equal(revokeResponse.status, 200);
    const revokedCredFile = path.join(tempRoot, 'revoked-credentials.json');
    fs.writeFileSync(revokedCredFile, JSON.stringify({
      apiUrl,
      refreshToken: persisted.refreshToken,
      sessionId: connected.data.sessionId,
      sessionExpiresAt: connected.data.sessionExpiresAt
    }));
    revokedMcp = startMcp({
      FUXI_API_URL: apiUrl,
      FUXI_CREDENTIALS_FILE: revokedCredFile,
      FUXI_TOKEN: '',
      FUXI_USERNAME: '',
      FUXI_PASSWORD: ''
    });
    const revokedResponse = await revokedMcp.send('tools/call', { name: 'list_prototypes', arguments: {} });
    const revoked = parseTool(revokedResponse);
    assert.equal(revoked.result.isError, true);
    assert.equal(revoked.body.error.code, 'SESSION_REVOKED');

    const packageHeaders = { Authorization: `Bearer ${bootstrap.data.token}` };
    const skillPackageResponse = await fetch(bootstrap.data.skillUrl, { headers: packageHeaders });
    assert.equal(skillPackageResponse.status, 200);
    const skillPackage = new AdmZip(Buffer.from(await skillPackageResponse.arrayBuffer()));
    const skillEntries = skillPackage.getEntries().map(entry => entry.entryName);
    assert(skillEntries.includes('fuxi-skyui-prototype/SKILL.md'));
    assert(skillEntries.includes('fuxi-skyui-prototype/references/workflow.md'));
    assert(!skillEntries.some(name => name.includes('.npmrc') || name.includes('node_modules')));

    const mcpPackageResponse = await fetch(bootstrap.data.mcpUrl, { headers: packageHeaders });
    assert.equal(mcpPackageResponse.status, 200);
    const mcpPackage = new AdmZip(Buffer.from(await mcpPackageResponse.arrayBuffer()));
    const mcpEntries = mcpPackage.getEntries().map(entry => entry.entryName);
    assert(mcpEntries.includes('fuxi-platform-mcp/src/server.js'));
    assert(mcpEntries.includes('fuxi-platform-mcp/src/fuxi-zip.js'));
    assert(mcpEntries.includes('fuxi-platform-mcp/package.json'));
    assert(!mcpEntries.some(name => name.includes('/tests/')));

    const expiredBootstrapToken = jwt.sign(
      { id: login.data.user.id, username: 'admin', roles: ['admin'] },
      'integration-test-secret',
      { expiresIn: -1 }
    );
    const expiredPackageResponse = await fetch(`${apiUrl}/api/integrations/skill-package`, {
      headers: { Authorization: `Bearer ${expiredBootstrapToken}` }
    });
    assert.equal(expiredPackageResponse.status, 401);
    const mcpTokenResponse = await fetch(`${apiUrl}/api/auth/mcp-token`, {
      headers: { Authorization: `Bearer ${login.data.token}` }
    });
    const mcpToken = await mcpTokenResponse.json();
    assert.equal(mcpTokenResponse.status, 200);
    assert.equal(mcpToken.data.expiresIn, 3600);
    assert(Date.parse(mcpToken.data.expiresAt) > Date.now());
    tokenMcp = startMcp({
      FUXI_API_URL: apiUrl,
      FUXI_TOKEN: mcpToken.data.token,
      FUXI_USERNAME: '',
      FUXI_PASSWORD: ''
    });
    const tokenList = await callTool(tokenMcp, 'list_prototypes', { scope: 'my' });
    assert(Array.isArray(tokenList.body.data));
    const projectCreateResponse = await fetch(`${apiUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.data.token}`
      },
      body: JSON.stringify({ name: 'MCP integration project', description: 'Isolated project fixture' })
    });
    const project = await projectCreateResponse.json();
    const projects = await callTool(mcp, 'list_projects', { keyword: 'integration project' });
    assert.equal(projects.body.data.length, 1);
    const projectDetail = await callTool(mcp, 'get_project', { projectId: project.data.id });
    assert.equal(projectDetail.body.data.name, 'MCP integration project');
    assert.deepEqual(projectDetail.body.data.prototypes, []);
    assert.equal(projectDetail.body.fields.projectId, project.data.id);

    const created = await callTool(mcp, 'create_prototype', {
      name: 'MCP integration fixture',
      description: 'Isolated end-to-end verification'
    });
    const prototypeId = created.body.data.id;
    assert(prototypeId);
    const projectInitialUpload = await callTool(mcp, 'upload_zip', {
      prototypeId,
      zipPath,
      versionNote: 'Project-bound initial upload',
      versionType: 'minor'
    });
    assert.equal(projectInitialUpload.body.data.entry_file, 'index.html');

    const bound = await callTool(mcp, 'bind_prototype_to_project', {
      projectId: project.data.id,
      prototypeId,
      menuPath: '/mcp/fixture',
      sortOrder: 1
    });
    assert.equal(bound.body.data.prototype_id, prototypeId);
    assert.equal(bound.body.fields.projectId, project.data.id);
    assert.equal(bound.body.fields.prototypeId, prototypeId);
    const boundAgain = await callTool(mcp, 'bind_prototype_to_project', {
      projectId: project.data.id,
      prototypeId,
      menuPath: '/mcp/fixture'
    });
    assert.equal(boundAgain.body.data.id, bound.body.data.id);
    const projectWithBinding = await callTool(mcp, 'get_project', { projectId: project.data.id });
    assert.equal(projectWithBinding.body.data.prototypes.length, 1);
    const projectPrototypeId = projectWithBinding.body.data.prototypes[0].id;

    // 无 Git 轻协作闭环：一次性任务 -> 候选上传 -> 独立预览 -> 人工采用。
    const lightweightPrototype = await callTool(mcp, 'create_prototype', {
      name: 'MCP lightweight collaboration fixture',
      description: 'Candidate adoption must be explicit'
    });
    const lightweightPrototypeId = lightweightPrototype.body.data.id;
    await callTool(mcp, 'upload_zip', {
      prototypeId: lightweightPrototypeId,
      zipPath,
      versionNote: 'Lightweight base upload'
    });
    await callTool(mcp, 'bind_prototype_to_project', {
      projectId: project.data.id,
      prototypeId: lightweightPrototypeId,
      menuPath: '/mcp/lightweight'
    });
    const handoff = await callTool(mcp, 'create_change_handoff', {
      projectId: project.data.id,
      prototypeId: lightweightPrototypeId,
      title: '候选版本修改',
      requirement: '将页面标题和正文更新为候选版本，但不要直接采用'
    });
    assert(handoff.body.handoffCode.startsWith('FX-'));
    assert.equal(handoff.body.baseVersion, 0);
    const redeemedHandoff = await callTool(mcp, 'redeem_change_handoff', {
      handoffCode: handoff.body.handoffCode
    });
    assert.equal(redeemedHandoff.body.changeId, handoff.body.changeId);
    assert.equal(redeemedHandoff.body.prototypeId, lightweightPrototypeId);
    assert.equal(redeemedHandoff.body.baseVersion, 0);
    assert(redeemedHandoff.body.sourceDownloadUrl.includes(`/api/prototypes/${lightweightPrototypeId}/download`));
    const reusedHandoffResponse = await mcp.send('tools/call', {
      name: 'redeem_change_handoff',
      arguments: { handoffCode: handoff.body.handoffCode }
    });
    const reusedHandoff = parseTool(reusedHandoffResponse);
    assert.equal(reusedHandoff.result.isError, true);
    assert.equal(reusedHandoff.body.error.code, 'HANDOFF_ALREADY_REDEEMED');

    const submittedCandidate = await callTool(mcp, 'submit_change_candidate', {
      projectId: project.data.id,
      changeId: handoff.body.changeId,
      zipPath: secondZipPath
    });
    assert.equal(submittedCandidate.body.status, 'preview_pending');
    assert.equal(submittedCandidate.body.candidateEntryFile, 'index.html');
    const pendingStatus = await callTool(mcp, 'get_change_status', {
      projectId: project.data.id,
      changeId: handoff.body.changeId
    });
    assert.equal(pendingStatus.body.status, 'preview_pending');
    assert.equal(pendingStatus.body.currentVersion, 0);
    const candidatePreviewResponse = await fetch(
      `${apiUrl}${pendingStatus.body.candidatePreviewPath}?token=${encodeURIComponent(login.data.token)}`
    );
    assert.equal(candidatePreviewResponse.status, 200);
    assert.match(await candidatePreviewResponse.text(), /MCP integration v2/);

    const previewValidationResponse = await fetch(`${apiUrl}/api/projects/${project.data.id}/changes/${handoff.body.changeId}/preview-validation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${login.data.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'passed', durationMs: 1200 })
    });
    const previewValidation = await previewValidationResponse.json();
    assert.equal(previewValidationResponse.status, 200);
    assert.equal(previewValidation.data.status, 'ready');
    const readyStatus = await callTool(mcp, 'get_change_status', {
      projectId: project.data.id,
      changeId: handoff.body.changeId
    });
    assert.equal(readyStatus.body.status, 'ready');
    assert.equal(readyStatus.body.currentVersion, 0);

    const adoptResponse = await fetch(`${apiUrl}/api/projects/${project.data.id}/changes/${handoff.body.changeId}/adopt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.data.token}` }
    });
    const adoptedCandidate = await adoptResponse.json();
    assert.equal(adoptResponse.status, 200);
    assert.equal(adoptedCandidate.data.change.status, 'adopted');
    assert.equal(adoptedCandidate.data.version.version_number, 1);
    const adoptedStatus = await callTool(mcp, 'get_change_status', {
      projectId: project.data.id,
      changeId: handoff.body.changeId
    });
    assert.equal(adoptedStatus.body.status, 'adopted');
    assert.equal(adoptedStatus.body.currentVersion, 1);

    const checkedOut = await callTool(mcp, 'checkout_prototype', {
      projectId: project.data.id,
      projectPrototypeId,
      note: 'MCP integration checkout',
      durationHours: 2
    });
    assert.equal(checkedOut.body.data.status, 'active');
    assert.equal(checkedOut.body.fields.projectId, project.data.id);
    const projectBeforeDelivery = await callTool(mcp, 'get_prototype', { prototypeId });
    const projectBoundDelivery = await callTool(mcp, 'deliver_project', {
      mode: 'project-bound-update',
      idempotencyKey: 'integration-project-update-0001',
      prototypeId,
      expectedVersion: projectBeforeDelivery.body.fields.versionNumber,
      expectedEntryFile: 'index.html',
      projectId: project.data.id,
      projectPrototypeId,
      zipPath: secondZipPath,
      versionNote: 'Safe project-bound update',
      versionType: 'minor'
    });
    assert.equal(projectBoundDelivery.body.affectedScope, 'target-project-binding-only');
    assert(projectBoundDelivery.body.versionAfter > projectBoundDelivery.body.versionBefore);

    const registerResponse = await fetch(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.data.token}`
      },
      body: JSON.stringify({ username: 'mcpuser2', password: 'pass1234', role: ['uploader'] })
    });
    const registered = await registerResponse.json();
    const memberResponse = await fetch(`${apiUrl}/api/projects/${project.data.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.data.token}`
      },
      body: JSON.stringify({ userId: registered.data.id, role: 'editor' })
    });
    assert.equal(memberResponse.status, 200);

    secondMcp = startMcp({
      FUXI_API_URL: apiUrl,
      FUXI_USERNAME: 'mcpuser2',
      FUXI_PASSWORD: 'pass1234',
      FUXI_TOKEN: ''
    });
    const conflictResponse = await secondMcp.send('tools/call', {
      name: 'checkout_prototype',
      arguments: {
        projectId: project.data.id,
        projectPrototypeId,
        note: 'second user checkout must conflict'
      }
    });
    const conflict = parseTool(conflictResponse);
    assert.equal(conflict.result.isError, true);
    assert.equal(conflict.body.error.code, 'CONFLICT');
    const checkoutProtectedResponse = await secondMcp.send('tools/call', {
      name: 'deliver_project',
      arguments: {
        mode: 'project-bound-update', idempotencyKey: 'integration-project-update-other-user', prototypeId,
        expectedVersion: projectBoundDelivery.body.versionAfter, projectId: project.data.id, projectPrototypeId,
        zipPath: packedZip, versionNote: 'Must require own checkout'
      }
    });
    const checkoutProtected = parseTool(checkoutProtectedResponse);
    assert.equal(checkoutProtected.result.isError, true);
    assert.equal(checkoutProtected.body.error.code, 'CHECKOUT_REQUIRED');

    const checkedIn = await callTool(mcp, 'checkin_prototype', {
      projectId: project.data.id,
      projectPrototypeId
    });
    assert(checkedIn.body.data.id);
    assert.equal(checkedIn.body.fields.projectId, project.data.id);
    const snapshot = await callTool(mcp, 'create_snapshot', {
      projectId: project.data.id,
      name: 'MCP integration snapshot',
      versionLabel: '1.0.0'
    });
    assert(snapshot.body.data.id);
    assert.equal(snapshot.body.data.name, 'MCP integration snapshot');
    assert.equal(snapshot.body.fields.projectId, project.data.id);

    const restoreWithoutConfirmResponse = await mcp.send('tools/call', {
      name: 'restore_snapshot',
      arguments: {
        projectId: project.data.id,
        snapshotId: snapshot.body.data.id
      }
    });
    const restoreWithoutConfirm = parseTool(restoreWithoutConfirmResponse);
    assert.equal(restoreWithoutConfirm.result.isError, true);
    assert.equal(restoreWithoutConfirm.body.error.code, 'CONFIRMATION_REQUIRED');
    const restored = await callTool(mcp, 'restore_snapshot', {
      projectId: project.data.id,
      snapshotId: snapshot.body.data.id,
      confirm: true
    });
    assert(restored.body.data.snapshot);
    assert.equal(restored.body.fields.projectId, project.data.id);

    const projectAfterRestore = await callTool(mcp, 'get_project', { projectId: project.data.id });
    const restoredProjectPrototypeId = projectAfterRestore.body.data.prototypes[0].id;
    const recheckedOut = await callTool(mcp, 'checkout_prototype', {
      projectId: project.data.id,
      projectPrototypeId: restoredProjectPrototypeId,
      note: 'checkout before force release'
    });
    assert.equal(recheckedOut.body.data.status, 'active');
    const releaseWithoutConfirmResponse = await mcp.send('tools/call', {
      name: 'force_release_checkout',
      arguments: {
        projectId: project.data.id,
        projectPrototypeId: restoredProjectPrototypeId
      }
    });
    const releaseWithoutConfirm = parseTool(releaseWithoutConfirmResponse);
    assert.equal(releaseWithoutConfirm.result.isError, true);
    assert.equal(releaseWithoutConfirm.body.error.code, 'CONFIRMATION_REQUIRED');
    const released = await callTool(mcp, 'force_release_checkout', {
      projectId: project.data.id,
      projectPrototypeId: restoredProjectPrototypeId,
      confirm: true
    });
    assert.equal(released.body.data.status, 'forced');
    assert.equal(released.body.fields.projectId, project.data.id);

    const uploaded = await callTool(mcp, 'upload_zip', {
      prototypeId,
      zipPath,
      versionNote: 'Initial integration upload',
      versionType: 'minor'
    });
    assert.equal(uploaded.body.data.entry_file, 'index.html');

    const uploadedV2 = await callTool(mcp, 'upload_zip', {
      prototypeId,
      zipPath: secondZipPath,
      versionNote: 'Second integration upload',
      versionType: 'minor'
    });
    assert.equal(uploadedV2.body.data.entry_file, 'index.html');

    const versionsResponse = await fetch(`${apiUrl}/api/prototypes/${prototypeId}/versions`, {
      headers: { Authorization: `Bearer ${login.data.token}` }
    });
    const versions = await versionsResponse.json();
    assert.equal(versions.data.length, 3);
    assert.equal(versions.data[0].version_number, 3);

    const detail = await callTool(mcp, 'get_prototype', { prototypeId });
    assert.equal(detail.body.data.entry_file, 'index.html');
    assert(detail.body.data.files.some(file => file.name === 'README.md'));
    assert.equal(detail.body.fields.prototypeId, prototypeId);
    assert.equal(detail.body.fields.entryFile, 'index.html');
    assert.equal(detail.body.fields.readmeStatus, 'present');
    assert.equal(detail.body.fields.versionNumber, 3);

    const readme = await callTool(mcp, 'get_readme', { prototypeId });
    assert.match(readme.body.data.content, /MCP Integration Fixture v2/);
    assert.equal(readme.body.fields.prototypeId, prototypeId);
    assert.equal(readme.body.fields.readmeStatus, 'present');

    const preview = await callTool(mcp, 'get_preview_url', { prototypeId });
    assert.equal(preview.body.access, 'share-link');
    assert.equal(preview.body.fields.prototypeId, prototypeId);
    assert.equal(preview.body.fields.entryFile, 'index.html');
    assert(preview.body.fields.previewUrl);
    const shareResponse = await fetch(preview.body.previewUrl, { redirect: 'manual' });
    assert.equal(shareResponse.status, 302);
    const cookie = shareResponse.headers.get('set-cookie').split(';')[0];
    const previewResponse = await fetch(new URL(shareResponse.headers.get('location'), apiUrl), {
      headers: { Cookie: cookie }
    });
    assert.equal(previewResponse.status, 200);
    assert.match(await previewResponse.text(), /Fuxi MCP integration v2/);

    const rollbackWithoutConfirmResponse = await mcp.send('tools/call', {
      name: 'rollback_version',
      arguments: {
        prototypeId,
        versionId: String(versions.data[0].id)
      }
    });
    const rollbackWithoutConfirm = parseTool(rollbackWithoutConfirmResponse);
    assert.equal(rollbackWithoutConfirm.result.isError, true);
    assert.equal(rollbackWithoutConfirm.body.error.code, 'CONFIRMATION_REQUIRED');
    const rolledBack = await callTool(mcp, 'rollback_version', {
      prototypeId,
      versionId: String(versions.data[0].id),
      confirm: true
    });
    assert(rolledBack.body.data);
    assert.equal(rolledBack.body.fields.prototypeId, prototypeId);

    const missingResponse = await mcp.send('tools/call', {
      name: 'upload_zip',
      arguments: {
        prototypeId,
        zipPath: path.join(tempRoot, 'missing-private-name.zip'),
        versionNote: 'Must fail safely'
      }
    });
    const missing = parseTool(missingResponse);
    assert.equal(missing.result.isError, true);
    assert.equal(missing.body.error.code, 'FILE_NOT_FOUND');
    assert(!missing.body.error.message.includes(tempRoot));

    invalidMcp = startMcp({ FUXI_API_URL: apiUrl, FUXI_TOKEN: 'invalid-test-token' });
    const unauthorizedResponse = await invalidMcp.send('tools/call', {
      name: 'list_prototypes',
      arguments: {}
    });
    const unauthorized = parseTool(unauthorizedResponse);
    assert.equal(unauthorized.result.isError, true);
    assert.equal(unauthorized.body.error.code, 'AUTHENTICATION_FAILED');

    const expiredToken = jwt.sign(
      { id: login.data.user.id, username: 'admin', roles: ['admin'] },
      'integration-test-secret',
      { expiresIn: -1 }
    );
    expiredMcp = startMcp({ FUXI_API_URL: apiUrl, FUXI_TOKEN: expiredToken });
    const expiredResponse = await expiredMcp.send('tools/call', { name: 'list_prototypes', arguments: {} });
    const expired = parseTool(expiredResponse);
    assert.equal(expired.result.isError, true);
    assert.equal(expired.body.error.code, 'AUTHENTICATION_FAILED');

    failMcp = startMcp({
      FUXI_API_URL: apiUrl,
      FUXI_USERNAME: 'admin',
      FUXI_PASSWORD: 'admin123',
      FUXI_TOKEN: '',
      NODE_ENV: 'test',
      FUXI_MCP_TEST_FAIL_AFTER_UPLOAD: '1'
    });
    const partialResponse = await failMcp.send('tools/call', {
      name: 'deliver_project',
      arguments: {
        mode: 'create', idempotencyKey: 'integration-partial-failure', name: 'Partial failure fixture',
        zipPath: packedZip, versionNote: 'Inject readback failure'
      }
    });
    const partial = parseTool(partialResponse);
    assert.equal(partial.result.isError, true);
    assert.equal(partial.body.error.code, 'DELIVERY_PARTIAL_FAILURE');
    assert.equal(partial.body.error.uploadApplied, true);
    assert.equal(partial.body.error.stage, 'UPLOAD');

    const deleteWithoutConfirmResponse = await mcp.send('tools/call', {
      name: 'delete_prototype',
      arguments: {
        prototypeId
      }
    });
    const deleteWithoutConfirm = parseTool(deleteWithoutConfirmResponse);
    assert.equal(deleteWithoutConfirm.result.isError, true);
    assert.equal(deleteWithoutConfirm.body.error.code, 'CONFIRMATION_REQUIRED');
    const deleted = await callTool(mcp, 'delete_prototype', {
      prototypeId,
      confirm: true
    });
    assert.equal(deleted.body.fields.prototypeId, prototypeId);

    console.log(JSON.stringify({
      ok: true,
      tools: listedTools.result.tools.map(tool => tool.name),
      prototypeId,
      entryFile: detail.body.data.entry_file,
      versionHistory: 'verified',
      readme: 'verified',
      preview: 'verified',
      shortLivedToken: 'verified',
      agentBootstrap: 'verified',
      skillPackage: 'verified',
      mcpPackage: 'verified',
      safeDelivery: 'verified',
      idempotency: 'verified',
      optimisticVersion: 'verified',
      checkoutProtection: 'verified',
      partialFailure: 'verified',
      deviceSession: 'verified',
      connectCode: 'verified',
      refreshRotation: 'verified',
      sessionRevoke: 'verified',
      projectReads: 'verified',
      collaboration: 'verified',
      lightweightCollaboration: 'verified',
      structuredErrors: ['FILE_NOT_FOUND', 'AUTHENTICATION_FAILED'],
      isolation: tempRoot
    }, null, 2));
  } finally {
    await stop(revokedMcp && revokedMcp.child);
    await stop(codeMcp && codeMcp.child);
    await stop(secondMcp && secondMcp.child);
    await stop(failMcp && failMcp.child);
    await stop(expiredMcp && expiredMcp.child);
    await stop(invalidMcp && invalidMcp.child);
    await stop(tokenMcp && tokenMcp.child);
    await stop(mcp && mcp.child);
    await stop(backend);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
