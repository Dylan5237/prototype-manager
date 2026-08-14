const {
  GitProvider,
  GitProviderError,
  assertMainProtection,
  assertRepositoryReady
} = require('./git-provider');

const NO_ACCESS = 0;
const MAINTAINER = 40;

function cleanBaseUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/i.test(text)) {
    throw new GitProviderError('GIT_PROVIDER_CONFIG_INVALID', 'GITLAB_BASE_URL 必须是 http(s) 地址');
  }
  const url = new URL(text);
  if (url.username || url.password) {
    throw new GitProviderError('GIT_PROVIDER_CONFIG_INVALID', 'GITLAB_BASE_URL 不得包含凭据');
  }
  return url.toString().replace(/\/$/, '');
}

function safeErrorCode(status) {
  if (status === 401) return 'GIT_PROVIDER_UNAUTHORIZED';
  if (status === 403) return 'GIT_PROVIDER_FORBIDDEN';
  if (status === 404) return 'GIT_PROVIDER_NOT_FOUND';
  if (status === 409) return 'GIT_PROVIDER_CONFLICT';
  if (status === 429) return 'GIT_PROVIDER_RATE_LIMITED';
  if (status >= 500) return 'GIT_PROVIDER_UNAVAILABLE';
  return 'GIT_PROVIDER_REQUEST_FAILED';
}

class GitLabProvider extends GitProvider {
  constructor({ baseUrl, token, namespaceId, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
    super();
    if (!token || !String(token).trim()) {
      throw new GitProviderError('GIT_PROVIDER_NOT_CONFIGURED', 'GitLab token 未配置');
    }
    if (!namespaceId && namespaceId !== 0) {
      throw new GitProviderError('GIT_PROVIDER_NOT_CONFIGURED', 'GitLab namespace 未配置');
    }
    if (typeof fetchImpl !== 'function') {
      throw new GitProviderError('GIT_PROVIDER_CONFIG_INVALID', '当前运行时不支持 fetch');
    }
    this.baseUrl = cleanBaseUrl(baseUrl);
    this.token = String(token);
    this.namespaceId = String(namespaceId);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  static fromEnvironment(env = process.env, options = {}) {
    return new GitLabProvider({
      baseUrl: env.GITLAB_BASE_URL,
      token: env.GITLAB_TOKEN,
      namespaceId: env.GITLAB_NAMESPACE_ID,
      ...options
    });
  }

  async request(method, apiPath, { body, allowStatuses = [] } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}/api/v4${apiPath}`;
    const headers = { 'PRIVATE-TOKEN': this.token, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const contentType = response.headers && response.headers.get
        ? response.headers.get('content-type') || ''
        : '';
      let payload = null;
      if (response.status !== 204) {
        payload = contentType.includes('application/json')
          ? await response.json()
          : await response.text();
      }
      if (!response.ok && !allowStatuses.includes(response.status)) {
        throw new GitProviderError(
          safeErrorCode(response.status),
          `GitLab 请求失败: ${method} ${apiPath} (${response.status})`,
          { status: response.status, retriable: response.status === 429 || response.status >= 500 }
        );
      }
      return { status: response.status, payload };
    } catch (error) {
      if (error instanceof GitProviderError) throw error;
      const timedOut = error && error.name === 'AbortError';
      throw new GitProviderError(
        timedOut ? 'GIT_PROVIDER_TIMEOUT' : 'GIT_PROVIDER_UNAVAILABLE',
        timedOut ? 'GitLab 请求超时' : 'GitLab 当前不可用',
        { retriable: true }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck() {
    const [{ payload: version }, { payload: namespace }] = await Promise.all([
      this.request('GET', '/version'),
      this.request('GET', `/namespaces/${encodeURIComponent(this.namespaceId)}`)
    ]);
    return {
      ok: true,
      provider: 'gitlab',
      version: version && version.version ? version.version : null,
      enterprise: Boolean(version && version.enterprise),
      namespace: {
        id: namespace.id,
        fullPath: namespace.full_path,
        kind: namespace.kind
      }
    };
  }

  async getRepositoryByPath(fullPath) {
    const { status, payload } = await this.request(
      'GET',
      `/projects/${encodeURIComponent(fullPath)}`,
      { allowStatuses: [404] }
    );
    return status === 404 ? null : payload;
  }

  async createPrivateRepository({ name, path, description = '' }) {
    const { payload } = await this.request('POST', '/projects', {
      body: {
        name,
        path,
        description,
        namespace_id: Number(this.namespaceId),
        visibility: 'private',
        initialize_with_readme: true,
        default_branch: 'main'
      }
    });
    return payload;
  }

  async ensurePrivateRepository({ name, path, description = '' }) {
    const health = await this.healthCheck();
    const namespacePath = health.namespace.fullPath;
    if (!namespacePath) {
      throw new GitProviderError('GIT_PROVIDER_NAMESPACE_INVALID', 'GitLab namespace 缺少 full_path');
    }
    const fullPath = `${namespacePath}/${path}`;
    let repository = await this.getRepositoryByPath(fullPath);
    let created = false;
    if (!repository) {
      repository = await this.createPrivateRepository({ name, path, description });
      created = true;
    }
    assertRepositoryReady(repository);
    return { repository, created, health };
  }

  async getProtectedBranch(projectId, branch = 'main') {
    const { status, payload } = await this.request(
      'GET',
      `/projects/${encodeURIComponent(projectId)}/protected_branches/${encodeURIComponent(branch)}`,
      { allowStatuses: [404] }
    );
    return status === 404 ? null : payload;
  }

  async protectMain(projectId) {
    const { status, payload } = await this.request(
      'POST',
      `/projects/${encodeURIComponent(projectId)}/protected_branches`,
      {
        body: {
          name: 'main',
          allowed_to_push: [{ access_level: NO_ACCESS }],
          allowed_to_merge: [{ access_level: MAINTAINER }],
          allow_force_push: false
        },
        allowStatuses: [409]
      }
    );
    return status === 409 ? this.getProtectedBranch(projectId, 'main') : payload;
  }

  async ensureMainProtected(projectId) {
    let protection = await this.getProtectedBranch(projectId, 'main');
    if (!protection) protection = await this.protectMain(projectId);
    assertMainProtection(protection);
    return protection;
  }
}

module.exports = {
  GitLabProvider,
  MAINTAINER,
  NO_ACCESS
};
