#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateProject, validateZipFile, packProject, ZipError } = require('./fuxi-zip');

const API_URL = (process.env.FUXI_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const MCP_VERSION = (() => {
  try { return require('../package.json').version || 'unknown'; } catch (e) { return 'unknown'; }
})();
const SKILL_VERSION = process.env.FUXI_SKILL_VERSION || 'unknown';
let cachedToken = process.env.FUXI_TOKEN || '';
const CREDENTIALS_FILE = process.env.FUXI_CREDENTIALS_FILE || path.join(os.homedir(), '.fuxi', 'mcp-credentials.json');
const DEVICE_LABEL = `${os.hostname()} (${process.platform})`;
let refreshToken = '';
let sessionId = null;
let sessionExpiresAt = null;
let accessExpiresAt = 0;
let nextId = 1;
const deliveryCache = new Map();

class ToolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const tools = [
  {
    name: 'check_connection',
    description: 'Check whether the Fuxi backend is reachable.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'list_prototypes',
    description: 'List prototypes accessible to the configured Fuxi account.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        categoryId: { type: 'string' },
        scope: { type: 'string', enum: ['my', 'shared', 'all'] },
        page: { type: 'number' },
        pageSize: { type: 'number' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'create_prototype',
    description: 'Create a Fuxi prototype record.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        categoryId: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_prototype',
    description: 'Read one prototype detail, including file tree metadata.',
    inputSchema: {
      type: 'object',
      required: ['prototypeId'],
      properties: {
        prototypeId: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_readme',
    description: 'Read the README extracted for a prototype.',
    inputSchema: {
      type: 'object',
      required: ['prototypeId'],
      properties: {
        prototypeId: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_preview_url',
    description: 'Create or reuse a browser-ready share URL for a prototype preview.',
    inputSchema: {
      type: 'object',
      required: ['prototypeId'],
      properties: {
        prototypeId: { type: 'string' },
        entryFile: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'upload_zip',
    description: 'Upload an existing ZIP file to a Fuxi prototype as a new version.',
    inputSchema: {
      type: 'object',
      required: ['prototypeId', 'zipPath', 'versionNote'],
      properties: {
        prototypeId: { type: 'string' },
        zipPath: { type: 'string' },
        versionNote: { type: 'string' },
        versionType: { type: 'string', enum: ['major', 'minor', 'patch'] }
      },
      additionalProperties: false
    }
  },
  {
    name: 'list_projects',
    description: 'List projects accessible to the configured Fuxi account.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_project',
    description: 'Read one accessible project with prototype bindings, members, and checkout status.',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'create_change_handoff',
    description: 'Create a lightweight Fuxi collaboration task for one project prototype. Returns a one-time handoff prompt; it does not change the current prototype.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'prototypeId', 'requirement'],
      properties: {
        projectId: { type: 'string' },
        prototypeId: { type: 'string' },
        title: { type: 'string' },
        requirement: { type: 'string', minLength: 1, maxLength: 4000 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'redeem_change_handoff',
    description: 'Redeem a one-time lightweight collaboration task code and read the authoritative base version and source download path.',
    inputSchema: {
      type: 'object',
      required: ['handoffCode'],
      properties: { handoffCode: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'get_change_status',
    description: 'Read one lightweight collaboration change, including its base/current version, candidate status, and preview path.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'changeId'],
      properties: {
        projectId: { type: 'string' },
        changeId: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'submit_change_candidate',
    description: 'Validate and upload a ZIP as a reviewable candidate for a redeemed task. This never changes the current prototype; a project owner/admin must adopt it in Fuxi.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'changeId', 'zipPath'],
      properties: {
        projectId: { type: 'string' },
        changeId: { type: 'string' },
        zipPath: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'bind_prototype_to_project',
    description: 'Bind an existing prototype into a project menu as a new project-prototype entry.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'prototypeId', 'menuPath'],
      properties: {
        projectId: { type: 'string' },
        prototypeId: { type: 'string' },
        menuPath: { type: 'string' },
        sortOrder: { type: 'number' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'checkout_prototype',
    description: 'Check out a bound project prototype for exclusive editing.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'projectPrototypeId'],
      properties: {
        projectId: { type: 'string' },
        projectPrototypeId: { type: 'number' },
        note: { type: 'string' },
        durationHours: { type: 'number' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'checkin_prototype',
    description: 'Check in a project prototype that the current user checked out.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'projectPrototypeId'],
      properties: {
        projectId: { type: 'string' },
        projectPrototypeId: { type: 'number' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'create_snapshot',
    description: 'Create a named project snapshot of menu configuration and bound prototype versions.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'name'],
      properties: {
        projectId: { type: 'string' },
        name: { type: 'string' },
        versionLabel: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'restore_snapshot',
    description: 'Restore a project snapshot. Requires explicit confirm: true and a production backup gate.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'snapshotId', 'confirm'],
      properties: {
        projectId: { type: 'string' },
        snapshotId: { type: 'number' },
        confirm: { type: 'boolean' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'delete_prototype',
    description: 'Move a prototype to the recycle bin. Requires explicit confirm: true.',
    inputSchema: {
      type: 'object',
      required: ['prototypeId', 'confirm'],
      properties: {
        prototypeId: { type: 'string' },
        confirm: { type: 'boolean' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'rollback_version',
    description: 'Roll a prototype back to a previous version. Requires explicit confirm: true and a backup gate for production.',
    inputSchema: {
      type: 'object',
      required: ['prototypeId', 'versionId', 'confirm'],
      properties: {
        prototypeId: { type: 'string' },
        versionId: { type: 'string' },
        confirm: { type: 'boolean' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'force_release_checkout',
    description: 'Force-release a checked-out project prototype. Owner/admin only; requires explicit confirm: true.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'projectPrototypeId', 'confirm'],
      properties: {
        projectId: { type: 'string' },
        projectPrototypeId: { type: 'number' },
        confirm: { type: 'boolean' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'validate_project',
    description: 'Validate a local project directory for Fuxi upload compatibility without modifying it.',
    inputSchema: {
      type: 'object',
      required: ['projectPath'],
      properties: {
        projectPath: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'validate_zip',
    description: 'Inspect an existing ZIP file for Fuxi upload compatibility.',
    inputSchema: {
      type: 'object',
      required: ['zipPath'],
      properties: {
        zipPath: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'pack_project',
    description: 'Create a Fuxi-compatible ZIP from a built project directory.',
    inputSchema: {
      type: 'object',
      required: ['projectPath', 'outputZipPath'],
      properties: {
        projectPath: { type: 'string' },
        outputZipPath: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'deliver_project',
    description: 'Safely create or update one Fuxi prototype with idempotency, optimistic version checks, optional project checkout protection, and mandatory readback.',
    inputSchema: {
      type: 'object',
      required: ['mode', 'idempotencyKey', 'zipPath', 'versionNote'],
      properties: {
        mode: { type: 'string', enum: ['create', 'update', 'project-bound-update'] },
        idempotencyKey: { type: 'string', minLength: 8 },
        zipPath: { type: 'string' },
        versionNote: { type: 'string' },
        versionType: { type: 'string', enum: ['major', 'minor', 'patch'] },
        name: { type: 'string' },
        description: { type: 'string' },
        categoryId: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        prototypeId: { type: 'string' },
        expectedVersion: { type: 'number' },
        expectedEntryFile: { type: 'string' },
        projectId: { type: 'string' },
        projectPrototypeId: { type: 'number' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'upload_project',
    description: 'Validate a ZIP then upload it to an explicit prototype as a new version.',
    inputSchema: {
      type: 'object',
      required: ['prototypeId', 'zipPath', 'versionNote'],
      properties: {
        prototypeId: { type: 'string' },
        zipPath: { type: 'string' },
        versionNote: { type: 'string' },
        versionType: { type: 'string', enum: ['major', 'minor', 'patch'] }
      },
      additionalProperties: false
    }
  }
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function request(apiPath, options = {}) {
  const url = new URL(apiPath, `${API_URL}/`);
  let response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    throw new ToolError('CONNECTION_FAILED', 'Unable to reach the Fuxi backend', {
      apiUrl: API_URL
    });
  }
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = text;
  }
  if (!response.ok || (body && body.success === false)) {
    const message = body && body.message ? body.message : `${response.status} ${response.statusText}`;
    let code = 'PLATFORM_REQUEST_FAILED';
    if (body && typeof body.code === 'string') code = body.code;
    else if (response.status === 401) code = 'AUTHENTICATION_FAILED';
    else if (response.status === 403) code = 'PERMISSION_DENIED';
    else if (response.status === 404) code = 'RESOURCE_NOT_FOUND';
    else if (response.status === 400) code = 'INVALID_REQUEST';
    else if (response.status === 409) code = 'CONFLICT';
    throw new ToolError(code, message, { httpStatus: response.status });
  }
  return body;
}

let credentialsLoaded = false;
let connectCodeConsumed = false;

function readCredentials() {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.apiUrl === API_URL && typeof data.refreshToken === 'string' && data.refreshToken) {
      refreshToken = data.refreshToken;
      sessionId = data.sessionId || null;
      sessionExpiresAt = data.sessionExpiresAt || null;
      return true;
    }
  } catch (e) {}
  return false;
}

function writeCredentials() {
  try {
    fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify({
      apiUrl: API_URL,
      refreshToken,
      sessionId,
      sessionExpiresAt,
      deviceLabel: DEVICE_LABEL,
      updatedAt: new Date().toISOString()
    }, null, 2), { mode: 0o600 });
  } catch (e) {
    // 持久化失败不阻断当前进程：凭据仍留在内存中可用到进程退出。
  }
}

async function connectWithCode(code) {
  const body = await request('/api/auth/mcp/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, deviceLabel: DEVICE_LABEL })
  });
  const data = body.data;
  cachedToken = data.accessToken;
  accessExpiresAt = Date.now() + data.expiresIn * 1000;
  refreshToken = data.refreshToken;
  sessionId = data.sessionId;
  sessionExpiresAt = data.sessionExpiresAt || null;
  connectCodeConsumed = true;
  writeCredentials();
  return cachedToken;
}

async function refreshAccessToken() {
  const body = await request('/api/auth/mcp/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken, deviceLabel: DEVICE_LABEL })
  });
  const data = body.data;
  cachedToken = data.accessToken;
  accessExpiresAt = Date.now() + data.expiresIn * 1000;
  refreshToken = data.refreshToken;
  sessionId = data.sessionId;
  sessionExpiresAt = data.sessionExpiresAt || null;
  writeCredentials();
  return cachedToken;
}

async function getToken() {
  if (cachedToken && accessExpiresAt > Date.now() + 5000) return cachedToken;

  if (!credentialsLoaded) {
    credentialsLoaded = true;
    readCredentials();
  }

  if (refreshToken) return refreshAccessToken();

  if (process.env.FUXI_CONNECT_CODE && !connectCodeConsumed) {
    return connectWithCode(process.env.FUXI_CONNECT_CODE);
  }

  if (cachedToken) return cachedToken;

  const username = process.env.FUXI_USERNAME;
  const password = process.env.FUXI_PASSWORD;
  if (username && password) {
    const body = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    cachedToken = body.data.token;
    accessExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return cachedToken;
  }

  throw new ToolError(
    'AUTHENTICATION_REQUIRED',
    'FUXI_CONNECT_CODE, FUXI_TOKEN, or FUXI_USERNAME/FUXI_PASSWORD is required'
  );
}

async function authed(apiPath, options = {}) {
  const call = token => request(apiPath, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  const token = await getToken();
  try {
    return await call(token);
  } catch (e) {
    if (e.code !== 'AUTHENTICATION_FAILED') throw e;
    const canRefresh = !!refreshToken ||
      (process.env.FUXI_CONNECT_CODE && !connectCodeConsumed) ||
      !!(process.env.FUXI_USERNAME && process.env.FUXI_PASSWORD);
    if (!canRefresh) throw e;
    cachedToken = '';
    accessExpiresAt = 0;
    const nextToken = await getToken();
    return call(nextToken);
  }
}

async function reportRuntime() {
  if (!sessionId) return null;
  return authed('/api/auth/mcp/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      mcpVersion: MCP_VERSION,
      skillVersion: SKILL_VERSION,
      runtimeVersion: process.version,
      platform: process.platform
    })
  });
}

function contentJson(data, isError = false) {
  const value = {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
  if (isError) value.isError = true;
  return value;
}

function toolFailure(errorValue) {
  const error = errorValue instanceof ToolError
    ? errorValue
    : new ToolError('INTERNAL_ERROR', errorValue.message || 'Unexpected MCP tool failure');
  return contentJson({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.details
    }
  }, true);
}

function prototypeFields(data) {
  if (!data || typeof data !== 'object') {
    return {
      prototypeId: null,
      entryFile: null,
      previewUrl: null,
      readmeStatus: null,
      versionNumber: null,
      projectId: null
    };
  }
  const readmeStatus = Array.isArray(data.files)
    ? (data.files.some(f => f.type === 'file' && /^(README|readme|docs\/README)\.md$/.test(f.path)) ? 'present' : 'missing')
    : null;
  return {
    prototypeId: data.id,
    entryFile: data.entry_file || null,
    previewUrl: null,
    readmeStatus,
    versionNumber: data.version !== undefined ? data.version : (data.version_number || null),
    projectId: null
  };
}

function projectFields(data) {
  if (!data || typeof data !== 'object') {
    return {
      prototypeId: null,
      entryFile: null,
      previewUrl: null,
      readmeStatus: null,
      versionNumber: null,
      projectId: null
    };
  }
  return {
    prototypeId: null,
    entryFile: null,
    previewUrl: null,
    readmeStatus: null,
    versionNumber: null,
    projectId: data.id
  };
}

function projectActionFields(data) {
  if (!data || typeof data !== 'object') {
    return {
      prototypeId: null,
      entryFile: null,
      previewUrl: null,
      readmeStatus: null,
      versionNumber: null,
      projectId: null
    };
  }
  return {
    prototypeId: data.prototype_id || null,
    entryFile: null,
    previewUrl: null,
    readmeStatus: null,
    versionNumber: null,
    projectId: data.project_id || data.id || null
  };
}

function withFields(payload, fields) {
  return { ...payload, fields };
}

function stableFingerprint(value) {
  if (Array.isArray(value)) return `[${value.map(stableFingerprint).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableFingerprint(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deliveryVersion(detail) {
  if (!detail || !detail.data) return null;
  const value = detail.data.version !== undefined ? detail.data.version : detail.data.version_number;
  return value === undefined || value === null ? null : Number(value);
}

async function uploadValidatedZip(prototypeId, args) {
  const zipPath = path.resolve(args.zipPath);
  const validation = validateZipFile(zipPath);
  if (!validation.ok) {
    throw new ToolError('VALIDATION_FAILED', validation.errors.join('; ') || 'ZIP validation failed', { stage: 'VALIDATE' });
  }
  const bytes = fs.readFileSync(zipPath);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'application/zip' }), path.basename(zipPath));
  form.set('versionNote', args.versionNote);
  form.set('versionType', args.versionType || 'patch');
  const uploaded = await authed(`/api/prototypes/${encodeURIComponent(prototypeId)}/upload`, {
    method: 'POST',
    body: form
  });
  return { uploaded, validation };
}

async function deliverProject(args) {
  const fingerprint = stableFingerprint(args);
  const cached = deliveryCache.get(args.idempotencyKey);
  if (cached) {
    if (cached.fingerprint !== fingerprint) {
      throw new ToolError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used with different delivery arguments', {
        stage: 'PREFLIGHT',
        idempotencyKey: args.idempotencyKey
      });
    }
    return { ...cached.result, idempotentReplay: true };
  }

  const mode = args.mode;
  if (mode === 'create' && (!args.name || !args.name.trim())) {
    throw new ToolError('INVALID_REQUEST', 'create mode requires a non-empty name', { stage: 'PREFLIGHT' });
  }
  if (mode !== 'create' && !args.prototypeId) {
    throw new ToolError('INVALID_REQUEST', `${mode} requires an explicit prototypeId`, { stage: 'PREFLIGHT' });
  }
  if (mode === 'project-bound-update' && (!args.projectId || !Number.isInteger(args.projectPrototypeId))) {
    throw new ToolError('INVALID_REQUEST', 'project-bound-update requires projectId and projectPrototypeId', { stage: 'PREFLIGHT' });
  }

  let stage = 'VALIDATE';
  let prototypeId = args.prototypeId || null;
  let versionBefore = null;
  let uploadApplied = false;
  let validation;
  let existingSnapshot = null;
  try {
    validation = validateZipFile(path.resolve(args.zipPath));
    if (!validation.ok) {
      throw new ToolError('VALIDATION_FAILED', validation.errors.join('; ') || 'ZIP validation failed');
    }

    if (mode === 'create') {
      stage = 'SNAPSHOT_EXISTING';
      const before = await authed('/api/prototypes?scope=all&pageSize=10000');
      existingSnapshot = new Map((before.data || []).map(item => [item.id, item.version ?? item.version_number ?? null]));
      stage = 'CREATE_TARGET';
      const created = await authed('/api/prototypes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: args.name.trim(), description: args.description, categoryId: args.categoryId, tags: args.tags })
      });
      prototypeId = created.data.id;
    } else {
      stage = 'READ_BEFORE';
      const before = await authed(`/api/prototypes/${encodeURIComponent(prototypeId)}`);
      versionBefore = deliveryVersion(before);
      if (args.expectedVersion !== undefined && versionBefore !== args.expectedVersion) {
        throw new ToolError('VERSION_CONFLICT', 'Prototype version changed before delivery', {
          expectedVersion: args.expectedVersion,
          actualVersion: versionBefore
        });
      }
      if (args.expectedEntryFile && before.data.entry_file !== args.expectedEntryFile) {
        throw new ToolError('ENTRY_FILE_MISMATCH', 'Prototype entry file changed before delivery', {
          expectedEntryFile: args.expectedEntryFile,
          actualEntryFile: before.data.entry_file || null
        });
      }
    }

    if (mode === 'project-bound-update') {
      stage = 'VERIFY_PROJECT_CHECKOUT';
      const [project, me] = await Promise.all([
        authed(`/api/projects/${encodeURIComponent(args.projectId)}`),
        authed('/api/auth/me')
      ]);
      const binding = (project.data.prototypes || []).find(item => item.id === args.projectPrototypeId);
      if (!binding || binding.prototype_id !== prototypeId) {
        throw new ToolError('TARGET_MISMATCH', 'Project binding does not match the requested prototype', {
          projectId: args.projectId,
          projectPrototypeId: args.projectPrototypeId,
          prototypeId
        });
      }
      if (!binding.checkout || binding.checkout.user_id !== me.data.id) {
        throw new ToolError('CHECKOUT_REQUIRED', 'The project prototype must be actively checked out by the current user', {
          projectId: args.projectId,
          projectPrototypeId: args.projectPrototypeId
        });
      }
    }

    stage = 'UPLOAD';
    const upload = await uploadValidatedZip(prototypeId, args);
    uploadApplied = true;
    validation = upload.validation;
    if (process.env.NODE_ENV === 'test' && process.env.FUXI_MCP_TEST_FAIL_AFTER_UPLOAD === '1') {
      throw new ToolError('TEST_READBACK_FAILURE', 'Injected readback failure for integration testing');
    }

    stage = 'READBACK_DETAIL';
    const detail = await authed(`/api/prototypes/${encodeURIComponent(prototypeId)}`);
    const versionAfter = deliveryVersion(detail);
    if (mode !== 'create' && (versionAfter === null || versionBefore === null || versionAfter <= versionBefore)) {
      throw new ToolError('VERSION_NOT_ADVANCED', 'Upload readback did not show a newer version', { versionBefore, versionAfter });
    }
    if (!detail.data.entry_file) {
      throw new ToolError('ENTRY_FILE_MISSING', 'Upload readback has no entry file');
    }

    stage = 'READBACK_README';
    const readme = await authed(`/api/prototypes/${encodeURIComponent(prototypeId)}/readme`);
    if (!readme.data) throw new ToolError('README_MISSING', 'Upload readback has no README');

    stage = 'READBACK_PREVIEW';
    const share = await authed(`/api/prototypes/${encodeURIComponent(prototypeId)}/public-link`);
    const previewUrl = new URL(share.data.url, `${API_URL}/`).toString();

    if (mode === 'create') {
      stage = 'VERIFY_EXISTING_UNCHANGED';
      const after = await authed('/api/prototypes?scope=all&pageSize=10000');
      const afterMap = new Map((after.data || []).map(item => [item.id, item.version ?? item.version_number ?? null]));
      for (const [id, version] of existingSnapshot) {
        if (!afterMap.has(id) || afterMap.get(id) !== version) {
          throw new ToolError('EXISTING_PROTOTYPE_CHANGED', 'Create delivery changed an existing prototype', { existingPrototypeId: id });
        }
      }
    }

    const result = {
      ok: true,
      status: 'COMPLETE',
      mode,
      idempotencyKey: args.idempotencyKey,
      idempotentReplay: false,
      prototypeId,
      versionBefore,
      versionAfter,
      entryFile: detail.data.entry_file,
      readmeStatus: 'present',
      previewUrl,
      affectedScope: mode === 'project-bound-update' ? 'target-project-binding-only' : 'target-prototype-only',
      projectId: args.projectId || null,
      projectPrototypeId: args.projectPrototypeId || null,
      validation,
      stages: ['VALIDATE', mode === 'create' ? 'CREATE_TARGET' : 'READ_BEFORE', 'UPLOAD', 'READBACK_DETAIL', 'READBACK_README', 'READBACK_PREVIEW']
    };
    deliveryCache.set(args.idempotencyKey, { fingerprint, result });
    return result;
  } catch (error) {
    if (uploadApplied) {
      throw new ToolError('DELIVERY_PARTIAL_FAILURE', 'Upload may have succeeded but mandatory readback did not complete', {
        stage,
        mode,
        prototypeId,
        versionBefore,
        uploadApplied: true,
        causeCode: error.code || 'INTERNAL_ERROR',
        recovery: 'Read back this exact prototypeId before retrying with a new idempotency key'
      });
    }
    if (error instanceof ToolError) {
      error.details = { stage, mode, prototypeId, uploadApplied: false, ...error.details };
    }
    throw error;
  }
}

async function callTool(name, args) {
  if (name === 'check_connection') {
    const data = await request('/api/health');
    let authentication = 'unconfigured';
    let runtime = { mcpVersion: MCP_VERSION, skillVersion: SKILL_VERSION };
    let update = null;
    if (process.env.FUXI_CONNECT_CODE || refreshToken || cachedToken || process.env.FUXI_USERNAME) {
      try {
        await getToken();
        authentication = 'verified';
        try {
          const heartbeat = await reportRuntime();
          runtime = heartbeat && heartbeat.data && heartbeat.data.session
            ? { ...runtime, ...heartbeat.data.session }
            : runtime;
          update = heartbeat && heartbeat.data && heartbeat.data.updates
            ? heartbeat.data.updates[0] || null
            : null;
        } catch (e) {
          // 旧服务端尚未提供 heartbeat 时，不阻断现有 MCP 连接。
        }
      } catch (e) {
        authentication = e.code || 'unverified';
      }
    }
    return contentJson({ apiUrl: API_URL, health: data, authentication, runtime, update });
  }

  if (name === 'list_prototypes') {
    const params = new URLSearchParams();
    if (args.keyword) params.set('keyword', args.keyword);
    if (args.categoryId) params.set('category_id', args.categoryId);
    if (args.scope) params.set('scope', args.scope);
    if (args.page) params.set('page', String(args.page));
    if (args.pageSize) params.set('pageSize', String(args.pageSize));
    const suffix = params.toString() ? `?${params}` : '';
    return contentJson(await authed(`/api/prototypes${suffix}`));
  }

  if (name === 'create_prototype') {
    const created = await authed('/api/prototypes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: args.name,
        description: args.description || '',
        categoryId: args.categoryId,
        tags: args.tags || []
      })
    });
    return contentJson(withFields(created, prototypeFields(created.data)));
  }

  if (name === 'get_prototype') {
    const detail = await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}`);
    return contentJson(withFields(detail, prototypeFields(detail.data)));
  }

  if (name === 'get_readme') {
    const readme = await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}/readme`);
    return contentJson(withFields(readme, {
      ...prototypeFields(readme.data || {}),
      prototypeId: args.prototypeId,
      readmeStatus: readme.data && readme.data.content ? 'present' : 'missing'
    }));
  }

  if (name === 'get_preview_url') {
    const prototype = (await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}`)).data;
    if (!prototype.entry_file) {
      throw new ToolError('PREVIEW_NOT_READY', 'Prototype has no entry file yet');
    }
    if (args.entryFile && args.entryFile !== prototype.entry_file) {
      throw new ToolError('ENTRY_FILE_MISMATCH', 'Requested entry file is not the current prototype entry');
    }
    const share = await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}/public-link`);
    return contentJson({
      apiUrl: API_URL,
      prototypeId: args.prototypeId,
      entryFile: prototype.entry_file.replace(/\\/g, '/'),
      previewUrl: new URL(share.data.url, `${API_URL}/`).toString(),
      access: 'share-link',
      fields: {
        prototypeId: args.prototypeId,
        entryFile: prototype.entry_file.replace(/\\/g, '/'),
        previewUrl: new URL(share.data.url, `${API_URL}/`).toString(),
        readmeStatus: null,
        versionNumber: prototype.version !== undefined ? prototype.version : null,
        projectId: null
      }
    });
  }

  if (name === 'upload_zip') {
    const zipPath = path.resolve(args.zipPath);
    if (!fs.existsSync(zipPath)) {
      throw new ToolError('FILE_NOT_FOUND', 'ZIP file not found', {
        fileName: path.basename(zipPath)
      });
    }
    validateZipFile(zipPath);
    const bytes = fs.readFileSync(zipPath);
    const form = new FormData();
    form.set('file', new Blob([bytes], { type: 'application/zip' }), path.basename(zipPath));
    form.set('versionNote', args.versionNote);
    form.set('versionType', args.versionType || 'patch');
    const uploaded = await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}/upload`, {
      method: 'POST',
      body: form
    });
    return contentJson(withFields(uploaded, prototypeFields(uploaded.data)));
  }

  if (name === 'list_projects') {
    const params = new URLSearchParams();
    if (args.keyword) params.set('keyword', args.keyword);
    const suffix = params.toString() ? `?${params}` : '';
    return contentJson(await authed(`/api/projects${suffix}`));
  }

  if (name === 'get_project') {
    const project = await authed(`/api/projects/${encodeURIComponent(args.projectId)}`);
    return contentJson(withFields(project, projectFields(project.data)));
  }

  if (name === 'create_change_handoff') {
    const created = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/prototypes/${encodeURIComponent(args.prototypeId)}/changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: args.title || '',
        requirement: args.requirement
      })
    });
    return contentJson({
      ...created,
      changeId: created.data.change.id,
      prototypeId: created.data.change.prototype_id,
      projectId: created.data.change.project_id,
      baseVersion: created.data.change.base_version_number,
      handoffCode: created.data.handoffCode,
      prompt: created.data.prompt,
      expiresAt: created.data.expiresAt
    });
  }

  if (name === 'redeem_change_handoff') {
    const redeemed = await authed('/api/projects/handoffs/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handoffCode: args.handoffCode })
    });
    const change = redeemed.data.change;
    return contentJson({
      ...redeemed,
      changeId: change.id,
      prototypeId: change.prototype_id,
      projectId: change.project_id,
      requirement: change.requirement,
      baseVersion: change.base_version_number,
      sourceDownloadUrl: new URL(redeemed.data.sourceDownloadPath, `${API_URL}/`).toString(),
      nextAction: 'Download the source, build a Fuxi-compatible ZIP, then call submit_change_candidate.'
    });
  }

  if (name === 'get_change_status') {
    const status = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/changes/${encodeURIComponent(args.changeId)}`);
    const change = status.data;
    return contentJson({
      ...status,
      changeId: change.id,
      prototypeId: change.prototype_id,
      projectId: change.project_id,
      status: change.status,
      baseVersion: change.base_version_number,
      currentVersion: change.current_version_number,
      candidateEntryFile: change.candidate_entry_file,
      candidatePreviewPath: change.preview_path
    });
  }

  if (name === 'submit_change_candidate') {
    const zipPath = path.resolve(args.zipPath);
    if (!fs.existsSync(zipPath)) {
      throw new ToolError('FILE_NOT_FOUND', 'ZIP file not found', { fileName: path.basename(zipPath) });
    }
    validateZipFile(zipPath);
    const bytes = fs.readFileSync(zipPath);
    const form = new FormData();
    form.set('file', new Blob([bytes], { type: 'application/zip' }), path.basename(zipPath));
    const submitted = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/changes/${encodeURIComponent(args.changeId)}/candidate`, {
      method: 'POST',
      body: form
    });
    const change = submitted.data;
    return contentJson({
      ...submitted,
      changeId: change.id,
      prototypeId: change.prototype_id,
      projectId: change.project_id,
      status: change.status,
      baseVersion: change.base_version_number,
      currentVersion: change.current_version_number,
      candidateEntryFile: change.candidate_entry_file,
      candidatePreviewPath: change.preview_path,
      nextAction: 'A project owner or admin must review and adopt this candidate in Fuxi.'
    });
  }

  if (name === 'bind_prototype_to_project') {
    const bound = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/prototypes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prototypeId: args.prototypeId,
        menuPath: args.menuPath,
        sortOrder: args.sortOrder || 0
      })
    });
    return contentJson(withFields(bound, projectActionFields(bound.data)));
  }

  if (name === 'checkout_prototype') {
    const checkout = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/prototypes/${args.projectPrototypeId}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: args.note || '',
        durationHours: args.durationHours || 24
      })
    });
    return contentJson(withFields(checkout, projectActionFields(checkout.data)));
  }

  if (name === 'checkin_prototype') {
    const checkin = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/prototypes/${args.projectPrototypeId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return contentJson(withFields(checkin, projectActionFields(checkin.data)));
  }

  if (name === 'create_snapshot') {
    const snapshot = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: args.name,
        versionLabel: args.versionLabel || ''
      })
    });
    return contentJson(withFields(snapshot, projectActionFields(snapshot.data)));
  }

  if (name === 'restore_snapshot') {
    if (args.confirm !== true) {
      throw new ToolError('CONFIRMATION_REQUIRED', 'restore_snapshot requires confirm: true; it rebuilds bindings and rolls back prototype files');
    }
    const restored = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/snapshots/${args.snapshotId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return contentJson({
      ...restored,
      fields: {
        prototypeId: null,
        entryFile: null,
        previewUrl: null,
        readmeStatus: null,
        versionNumber: null,
        projectId: args.projectId
      }
    });
  }

  if (name === 'delete_prototype') {
    if (args.confirm !== true) {
      throw new ToolError('CONFIRMATION_REQUIRED', 'delete_prototype requires confirm: true; it moves the prototype to the recycle bin');
    }
    const deleted = await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}`, {
      method: 'DELETE'
    });
    return contentJson({
      ...deleted,
      fields: {
        prototypeId: args.prototypeId,
        entryFile: null,
        previewUrl: null,
        readmeStatus: null,
        versionNumber: null,
        projectId: null
      }
    });
  }

  if (name === 'rollback_version') {
    if (args.confirm !== true) {
      throw new ToolError('CONFIRMATION_REQUIRED', 'rollback_version requires confirm: true; it replaces current prototype files with the target version');
    }
    const rolledBack = await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}/versions/${encodeURIComponent(args.versionId)}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return contentJson(withFields(rolledBack, prototypeFields(rolledBack.data)));
  }

  if (name === 'force_release_checkout') {
    if (args.confirm !== true) {
      throw new ToolError('CONFIRMATION_REQUIRED', 'force_release_checkout requires confirm: true and owner/admin role');
    }
    const released = await authed(`/api/projects/${encodeURIComponent(args.projectId)}/prototypes/${args.projectPrototypeId}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return contentJson(withFields(released, projectActionFields(released.data)));
  }

  if (name === 'validate_project') {
    return contentJson(validateProject(args.projectPath));
  }

  if (name === 'validate_zip') {
    return contentJson(validateZipFile(args.zipPath));
  }

  if (name === 'pack_project') {
    return contentJson(packProject(args.projectPath, args.outputZipPath));
  }

  if (name === 'upload_project') {
    const zipPath = path.resolve(args.zipPath);
    const validation = validateZipFile(zipPath);
    if (!validation.ok) {
      throw new ZipError(validation.errors.join('; ') || 'ZIP validation failed', 'VALIDATION_FAILED');
    }
    const bytes = fs.readFileSync(zipPath);
    const form = new FormData();
    form.set('file', new Blob([bytes], { type: 'application/zip' }), path.basename(zipPath));
    form.set('versionNote', args.versionNote);
    form.set('versionType', args.versionType || 'patch');
    const uploaded = await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}/upload`, {
      method: 'POST',
      body: form
    });
    const detail = await authed(`/api/prototypes/${encodeURIComponent(args.prototypeId)}`);
    return contentJson({
      ok: true,
      prototypeId: args.prototypeId,
      entryFile: detail.data.entry_file,
      version: uploaded.data && uploaded.data.version_label ? uploaded.data.version_label : null,
      readme: 'uploaded' in uploaded ? 'uploaded' : detail.data.entry_file ? 'check' : 'pending',
      affectedScope: 'target-prototype-only',
      fields: {
        prototypeId: args.prototypeId,
        entryFile: detail.data.entry_file,
        previewUrl: null,
        readmeStatus: null,
        versionNumber: uploaded.data && uploaded.data.version !== undefined ? uploaded.data.version : null,
        projectId: null
      },
      validation
    });
  }

  if (name === 'deliver_project') {
    return contentJson(await deliverProject(args));
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  if (message.method === 'initialize') {
    result(message.id, {
      protocolVersion: message.params && message.params.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'fuxi-platform-mcp-server', version: MCP_VERSION }
    });
    return;
  }

  if (message.method === 'tools/list') {
    result(message.id, { tools });
    return;
  }

  if (message.method === 'tools/call') {
    try {
      const toolResult = await callTool(message.params.name, message.params.arguments || {});
      result(message.id, toolResult);
    } catch (e) {
      result(message.id, toolFailure(e));
    }
    return;
  }

  if (message.id !== undefined) {
    error(message.id, -32601, `Method not found: ${message.method}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (e) {
      error(nextId++, -32700, e.message);
    }
  }
});
