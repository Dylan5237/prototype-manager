const crypto = require('crypto');
const { queryOne, runInTransaction } = require('../database/db');
const { ACTIONS } = require('./authorization');
const { GitProviderError, assertMainProtection, assertRepositoryReady } = require('./git-provider');

class RepositoryProvisioningError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RepositoryProvisioningError';
    this.code = code;
  }
}

function repositoryPathFor(prototypeId) {
  const raw = String(prototypeId || '').toLowerCase();
  let safe = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!safe) safe = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
  if (safe.length > 72) {
    const digest = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 10);
    safe = `${safe.slice(0, 61)}-${digest}`;
  }
  return `prototype-${safe}`;
}

function safeProviderError(error) {
  if (error instanceof GitProviderError || error instanceof RepositoryProvisioningError) {
    return error;
  }
  return new RepositoryProvisioningError('GIT_REPOSITORY_PROVISION_FAILED', '协作仓库供应失败');
}

function createDatabaseRepositoryStore() {
  return {
    getPrototype(prototypeId) {
      return queryOne(`SELECT * FROM prototypes WHERE id = ? AND deleted_at IS NULL`, [prototypeId]);
    },

    markProvisioning({ projectId, prototypeId, provider }) {
      return runInTransaction(db => {
        const current = queryOne(`SELECT project_id FROM prototypes WHERE id = ?`, [prototypeId]);
        if (!current) throw new RepositoryProvisioningError('PROTOTYPE_NOT_FOUND', '原型不存在');
        if (current.project_id && String(current.project_id) !== String(projectId)) {
          throw new RepositoryProvisioningError('PROTOTYPE_PROJECT_CONFLICT', '原型已归属其他项目');
        }
        db.run(`
          UPDATE prototypes
          SET project_id = ?, repo_provider = ?, collaboration_status = 'provisioning', sync_error = NULL
          WHERE id = ?
        `, [projectId, provider, prototypeId]);
      });
    },

    markReady({ prototypeId, provider, repository, defaultBranch }) {
      runInTransaction(db => {
        db.run(`
          UPDATE prototypes
          SET repo_provider = ?, repo_external_id = ?, repo_path = ?, default_branch = ?,
              collaboration_status = 'ready', sync_error = NULL
          WHERE id = ?
        `, [provider, String(repository.id), repository.path_with_namespace, defaultBranch, prototypeId]);
      });
      return this.getPrototype(prototypeId);
    },

    markFailed({ prototypeId, code }) {
      runInTransaction(db => {
        db.run(`
          UPDATE prototypes
          SET collaboration_status = 'failed', sync_error = ?
          WHERE id = ?
        `, [String(code || 'GIT_REPOSITORY_PROVISION_FAILED').slice(0, 160), prototypeId]);
      });
      return this.getPrototype(prototypeId);
    }
  };
}

class RepositoryProvisioningService {
  constructor({ provider, authorization, store = createDatabaseRepositoryStore() }) {
    if (!provider || !authorization || !store) {
      throw new TypeError('provider、authorization 和 store 均不能为空');
    }
    this.provider = provider;
    this.authorization = authorization;
    this.store = store;
  }

  async provision({ actor, projectId, prototypeId, name, description = '' }) {
    const resource = { type: 'prototype', projectId, prototypeId };
    this.authorization.assertCan(actor, ACTIONS.MANAGE_REPOSITORIES, resource);
    const prototype = this.store.getPrototype(prototypeId);
    if (!prototype) {
      throw new RepositoryProvisioningError('PROTOTYPE_NOT_FOUND', '原型不存在');
    }
    if (prototype.project_id && String(prototype.project_id) !== String(projectId)) {
      throw new RepositoryProvisioningError('PROTOTYPE_PROJECT_CONFLICT', '原型已归属其他项目');
    }

    this.store.markProvisioning({ projectId, prototypeId, provider: 'gitlab' });
    try {
      const ensured = await this.provider.ensurePrivateRepository({
        name: name || prototype.name,
        path: repositoryPathFor(prototypeId),
        description
      });
      assertRepositoryReady(ensured.repository);
      const protection = await this.provider.ensureMainProtected(ensured.repository.id);
      assertMainProtection(protection);
      const updated = this.store.markReady({
        prototypeId,
        provider: 'gitlab',
        repository: ensured.repository,
        defaultBranch: 'main'
      });
      return {
        prototype: updated,
        repository: {
          externalId: String(ensured.repository.id),
          path: ensured.repository.path_with_namespace,
          created: ensured.created
        },
        mainProtection: {
          directPushAllowed: false,
          forcePushAllowed: false,
          mergeAccessLevel: 'maintainer'
        }
      };
    } catch (error) {
      const safeError = safeProviderError(error);
      this.store.markFailed({ prototypeId, code: safeError.code });
      throw safeError;
    }
  }
}

module.exports = {
  RepositoryProvisioningError,
  RepositoryProvisioningService,
  createDatabaseRepositoryStore,
  repositoryPathFor
};
