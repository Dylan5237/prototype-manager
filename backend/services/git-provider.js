class GitProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'GitProviderError';
    this.code = code;
    this.status = options.status || null;
    this.retriable = Boolean(options.retriable);
  }
}

class GitProvider {
  async healthCheck() {
    throw new GitProviderError('GIT_PROVIDER_NOT_IMPLEMENTED', 'Provider 未实现健康检查');
  }

  async ensurePrivateRepository() {
    throw new GitProviderError('GIT_PROVIDER_NOT_IMPLEMENTED', 'Provider 未实现仓库供应');
  }

  async ensureMainProtected() {
    throw new GitProviderError('GIT_PROVIDER_NOT_IMPLEMENTED', 'Provider 未实现 main 保护');
  }
}

function assertRepositoryReady(repository) {
  if (!repository || repository.visibility !== 'private') {
    throw new GitProviderError('GIT_REPOSITORY_NOT_PRIVATE', '协作仓库必须是 private');
  }
  if (repository.default_branch !== 'main') {
    throw new GitProviderError('GIT_DEFAULT_BRANCH_INVALID', '协作仓库默认分支必须是 main');
  }
  return true;
}

function assertMainProtection(protection) {
  if (!protection || protection.name !== 'main') {
    throw new GitProviderError('GIT_MAIN_NOT_PROTECTED', 'main 分支尚未受保护');
  }
  if (protection.allow_force_push !== false) {
    throw new GitProviderError('GIT_FORCE_PUSH_ALLOWED', 'main 分支仍允许 force push');
  }
  const pushLevels = Array.isArray(protection.push_access_levels)
    ? protection.push_access_levels
    : [];
  if (pushLevels.length === 0 || pushLevels.some(level => Number(level.access_level) !== 0)) {
    throw new GitProviderError('GIT_DIRECT_PUSH_ALLOWED', 'main 分支仍允许直接 push');
  }
  const mergeLevels = Array.isArray(protection.merge_access_levels)
    ? protection.merge_access_levels
    : [];
  if (!mergeLevels.some(level => Number(level.access_level) === 40)) {
    throw new GitProviderError('GIT_MERGE_NOT_MAINTAINER_ONLY', 'main 合并权限必须限定为 Maintainer');
  }
  return true;
}

module.exports = {
  GitProvider,
  GitProviderError,
  assertMainProtection,
  assertRepositoryReady
};
