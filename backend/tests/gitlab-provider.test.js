const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ACTIONS } = require('../services/authorization');
const { AuthorizationService } = require('../services/authorization');
const { GitProviderError } = require('../services/git-provider');
const { GitLabProvider } = require('../services/gitlab-provider');
const {
  RepositoryProvisioningService,
  repositoryPathFor
} = require('../services/repository-provisioning');

function jsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
    async json() { return payload; },
    async text() { return JSON.stringify(payload); }
  };
}

function validProtection() {
  return {
    name: 'main',
    allow_force_push: false,
    push_access_levels: [{ access_level: 0 }],
    merge_access_levels: [{ access_level: 40 }]
  };
}

function createGitLabFetch({ existingRepository = null, existingProtection = null, failureStatus = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const call = {
      url,
      method: options.method,
      headers: options.headers,
      body: options.body ? JSON.parse(options.body) : undefined
    };
    calls.push(call);
    const pathname = new URL(url).pathname;
    if (failureStatus) return jsonResponse(failureStatus, { message: `secret token-value must not leak` });
    if (pathname.endsWith('/api/v4/version')) {
      return jsonResponse(200, { version: '18.1.1-ee', enterprise: true });
    }
    if (pathname.endsWith('/api/v4/namespaces/42')) {
      return jsonResponse(200, { id: 42, full_path: 'fuxi/prototypes', kind: 'group' });
    }
    if (options.method === 'GET' && pathname.includes('/api/v4/projects/fuxi%2Fprototypes%2F')) {
      return existingRepository ? jsonResponse(200, existingRepository) : jsonResponse(404, { message: '404' });
    }
    if (options.method === 'POST' && pathname.endsWith('/api/v4/projects')) {
      return jsonResponse(201, {
        id: 321,
        name: call.body.name,
        path: call.body.path,
        path_with_namespace: `fuxi/prototypes/${call.body.path}`,
        visibility: 'private',
        default_branch: 'main'
      });
    }
    if (options.method === 'GET' && pathname.endsWith('/protected_branches/main')) {
      return existingProtection ? jsonResponse(200, existingProtection) : jsonResponse(404, { message: '404' });
    }
    if (options.method === 'POST' && pathname.endsWith('/protected_branches')) {
      return jsonResponse(201, validProtection());
    }
    throw new Error(`Unexpected GitLab request: ${options.method} ${pathname}`);
  };
  return { calls, fetchImpl };
}

function createProvider(fetchImpl, token = 'top-secret-token') {
  return new GitLabProvider({
    baseUrl: 'https://gitlab.example.test',
    token,
    namespaceId: 42,
    fetchImpl,
    timeoutMs: 1000
  });
}

test('GitLab provider fails closed when required configuration is absent', () => {
  assert.throws(
    () => GitLabProvider.fromEnvironment({}),
    error => error instanceof GitProviderError && error.code === 'GIT_PROVIDER_NOT_CONFIGURED'
  );
});

test('GitLab provider creates a private main repository and explicitly blocks direct push', async () => {
  const fake = createGitLabFetch();
  const provider = createProvider(fake.fetchImpl);
  const ensured = await provider.ensurePrivateRepository({
    name: '订单原型',
    path: 'prototype-order',
    description: 'managed by Fuxi'
  });
  const protection = await provider.ensureMainProtected(ensured.repository.id);

  assert.equal(ensured.created, true);
  assert.equal(ensured.repository.visibility, 'private');
  assert.equal(ensured.repository.default_branch, 'main');
  assert.equal(ensured.health.version, '18.1.1-ee');
  assert.equal(protection.push_access_levels[0].access_level, 0);

  const createCall = fake.calls.find(call => call.method === 'POST' && call.url.endsWith('/api/v4/projects'));
  assert.deepEqual(createCall.body, {
    name: '订单原型',
    path: 'prototype-order',
    description: 'managed by Fuxi',
    namespace_id: 42,
    visibility: 'private',
    initialize_with_readme: true,
    default_branch: 'main'
  });
  const protectCall = fake.calls.find(call => call.method === 'POST' && call.url.endsWith('/protected_branches'));
  assert.deepEqual(protectCall.body.allowed_to_push, [{ access_level: 0 }]);
  assert.deepEqual(protectCall.body.allowed_to_merge, [{ access_level: 40 }]);
  assert.equal(protectCall.body.allow_force_push, false);
  assert.equal(protectCall.headers['PRIVATE-TOKEN'], 'top-secret-token');
});

test('GitLab provider reuses an existing valid repository and protection', async () => {
  const repository = {
    id: 88,
    name: '已有原型',
    path: 'prototype-existing',
    path_with_namespace: 'fuxi/prototypes/prototype-existing',
    visibility: 'private',
    default_branch: 'main'
  };
  const fake = createGitLabFetch({ existingRepository: repository, existingProtection: validProtection() });
  const provider = createProvider(fake.fetchImpl);
  const ensured = await provider.ensurePrivateRepository({ name: repository.name, path: repository.path });
  await provider.ensureMainProtected(repository.id);

  assert.equal(ensured.created, false);
  assert.equal(ensured.repository.id, 88);
  assert.equal(fake.calls.some(call => call.method === 'POST'), false);
});

test('GitLab provider rejects a branch rule that still permits direct push', async () => {
  const unsafe = {
    ...validProtection(),
    push_access_levels: [{ access_level: 40 }]
  };
  const fake = createGitLabFetch({ existingProtection: unsafe });
  const provider = createProvider(fake.fetchImpl);
  await assert.rejects(
    () => provider.ensureMainProtected(321),
    error => error instanceof GitProviderError && error.code === 'GIT_DIRECT_PUSH_ALLOWED'
  );
});

test('GitLab provider errors never include credentials or response details', async () => {
  const token = 'token-that-must-not-leak';
  const fake = createGitLabFetch({ failureStatus: 500 });
  const provider = createProvider(fake.fetchImpl, token);
  await assert.rejects(
    () => provider.healthCheck(),
    error => {
      assert.equal(error.code, 'GIT_PROVIDER_UNAVAILABLE');
      assert.equal(error.retriable, true);
      assert.equal(error.message.includes(token), false);
      assert.equal(error.message.includes('token-value'), false);
      return true;
    }
  );
});

test('repository provisioning persists ready state only after provider readback', async () => {
  const transitions = [];
  const prototype = { id: 'Proto 123', name: '客户中心', project_id: null };
  const store = {
    getPrototype: () => prototype,
    markProvisioning(input) { transitions.push(['provisioning', input]); },
    markReady(input) {
      transitions.push(['ready', input]);
      return { ...prototype, collaboration_status: 'ready', repo_external_id: String(input.repository.id) };
    },
    markFailed(input) { transitions.push(['failed', input]); }
  };
  const authorization = {
    assertCan(actor, action, resource) {
      assert.equal(actor.id, 10);
      assert.equal(action, ACTIONS.MANAGE_REPOSITORIES);
      assert.equal(resource.projectId, 'project-1');
    }
  };
  const provider = {
    async ensurePrivateRepository(input) {
      assert.equal(input.path, 'prototype-proto-123');
      return {
        created: true,
        repository: {
          id: 900,
          path_with_namespace: 'fuxi/prototypes/prototype-proto-123',
          visibility: 'private',
          default_branch: 'main'
        }
      };
    },
    async ensureMainProtected() { return validProtection(); }
  };
  const service = new RepositoryProvisioningService({ provider, authorization, store });
  const result = await service.provision({
    actor: { id: 10 },
    projectId: 'project-1',
    prototypeId: prototype.id
  });

  assert.equal(result.prototype.collaboration_status, 'ready');
  assert.equal(result.mainProtection.directPushAllowed, false);
  assert.deepEqual(transitions.map(([state]) => state), ['provisioning', 'ready']);
});

test('repository provisioning records only a safe failure code', async () => {
  const transitions = [];
  const store = {
    getPrototype: () => ({ id: 'p1', name: '原型', project_id: null }),
    markProvisioning() { transitions.push('provisioning'); },
    markReady() { transitions.push('ready'); },
    markFailed(input) { transitions.push(`failed:${input.code}`); }
  };
  const service = new RepositoryProvisioningService({
    provider: {
      async ensurePrivateRepository() {
        throw new GitProviderError('GIT_PROVIDER_FORBIDDEN', 'forbidden');
      }
    },
    authorization: { assertCan() {} },
    store
  });
  await assert.rejects(
    () => service.provision({ actor: { id: 1 }, projectId: 'project-1', prototypeId: 'p1' }),
    error => error.code === 'GIT_PROVIDER_FORBIDDEN'
  );
  assert.deepEqual(transitions, ['provisioning', 'failed:GIT_PROVIDER_FORBIDDEN']);
});

test('repository paths are deterministic and bounded', () => {
  assert.equal(repositoryPathFor('Proto 123'), 'prototype-proto-123');
  const longPath = repositoryPathFor('A'.repeat(200));
  assert.ok(longPath.length <= 83);
  assert.match(longPath, /^prototype-[a-z0-9-]+$/);
});

test('phase 1 vertical slice provisions a protected repository into the real domain store', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-phase1-slice-'));
  const dbPath = path.join(tempRoot, 'phase1.db');
  const database = require('../database/db');
  try {
    await database.initDatabase({ path: dbPath });
    const timestamp = '2026-08-14T00:00:00.000Z';
    database.run(`
      INSERT INTO users (id, username, password_hash, nickname, role, created_at)
      VALUES (1, 'owner', 'hash', 'Owner', '["editor"]', ?)
    `, [timestamp]);
    database.run(`
      INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at)
      VALUES ('phase1-project', '阶段一临时项目', '', '{"items":[]}', 1, ?, ?)
    `, [timestamp, timestamp]);
    database.run(`
      INSERT INTO prototypes
        (id, name, description, entry_file, created_by, created_at, updated_at)
      VALUES ('phase1-prototype', '阶段一原型', '', 'index.html', 1, ?, ?)
    `, [timestamp, timestamp]);

    const fake = createGitLabFetch();
    const provider = createProvider(fake.fetchImpl);
    const service = new RepositoryProvisioningService({
      provider,
      authorization: new AuthorizationService()
    });
    const result = await service.provision({
      actor: { id: 1, roles: ['editor'] },
      projectId: 'phase1-project',
      prototypeId: 'phase1-prototype'
    });
    const stored = database.queryOne(`SELECT * FROM prototypes WHERE id = 'phase1-prototype'`);

    assert.equal(result.repository.created, true);
    assert.equal(result.mainProtection.directPushAllowed, false);
    assert.equal(stored.project_id, 'phase1-project');
    assert.equal(stored.repo_provider, 'gitlab');
    assert.equal(stored.repo_external_id, '321');
    assert.equal(stored.repo_path, 'fuxi/prototypes/prototype-phase1-prototype');
    assert.equal(stored.default_branch, 'main');
    assert.equal(stored.collaboration_status, 'ready');
  } finally {
    database.closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
