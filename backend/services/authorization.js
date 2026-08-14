const ACTIONS = Object.freeze({
  VIEW_PROJECT: 'project.view',
  MANAGE_MEMBERS: 'project.members.manage',
  MANAGE_REPOSITORIES: 'repository.manage',
  START_CHANGE: 'change.start',
  READ_SOURCE: 'source.read',
  SUBMIT_CHANGE: 'change.submit',
  VIEW_CHANGE: 'change.view',
  REVIEW_CHANGE: 'change.review',
  MERGE_CHANGE: 'change.merge',
  EDIT_DRAFT: 'project.draft.edit',
  RELEASE_PROJECT: 'project.release',
  DELETE_PROJECT: 'project.delete'
});

const ALL_ACTIONS = new Set(Object.values(ACTIONS));
const PROJECT_ADMIN_ACTIONS = new Set(Object.values(ACTIONS));
const PROJECT_MEMBER_ACTIONS = new Set([
  ACTIONS.VIEW_PROJECT,
  ACTIONS.START_CHANGE,
  ACTIONS.READ_SOURCE,
  ACTIONS.SUBMIT_CHANGE,
  ACTIONS.VIEW_CHANGE
]);
const LEGACY_VIEWER_ACTIONS = new Set([ACTIONS.VIEW_PROJECT, ACTIONS.VIEW_CHANGE]);
const AGENT_ALLOWED_ACTIONS = new Set([
  ACTIONS.READ_SOURCE,
  ACTIONS.SUBMIT_CHANGE,
  ACTIONS.VIEW_CHANGE
]);
const ACTION_SCOPE = Object.freeze({
  [ACTIONS.READ_SOURCE]: 'source:read',
  [ACTIONS.SUBMIT_CHANGE]: 'change:submit',
  [ACTIONS.VIEW_CHANGE]: 'change:view'
});

class AuthorizationError extends Error {
  constructor(action, resource) {
    super('无权执行该操作');
    this.name = 'AuthorizationError';
    this.code = 'AUTHORIZATION_DENIED';
    this.action = action;
    this.resourceType = resource && resource.type ? resource.type : 'unknown';
  }
}

function normalizeRoles(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch (error) {
      return [value];
    }
  }
  return [];
}

function isPlatformAdmin(actor) {
  const roles = normalizeRoles(actor && (actor.roles || actor.role));
  return roles.includes('admin') || roles.includes('platform_admin');
}

function normalizeProjectRole(role, isOwner) {
  if (isOwner) return 'project_admin';
  if (role === 'admin' || role === 'owner') return 'project_admin';
  if (role === 'member' || role === 'editor') return 'project_member';
  if (role === 'viewer') return 'legacy_viewer';
  return null;
}

class AuthorizationService {
  constructor({ getProjectById, getProjectMember } = {}) {
    if (!getProjectById || !getProjectMember) {
      const projects = require('./db-projects');
      this.getProjectById = projects.getProjectById;
      this.getProjectMember = projects.getProjectMember;
    } else {
      this.getProjectById = getProjectById;
      this.getProjectMember = getProjectMember;
    }
  }

  resolveContext(actor, resource = {}) {
    const humanActor = actor && actor.type === 'agent' ? actor.user : actor;
    if (!humanActor || humanActor.id == null) {
      return { humanActor: null, project: null, projectRole: null };
    }
    const projectId = resource.projectId || (resource.project && resource.project.id);
    const project = resource.project || (projectId ? this.getProjectById(projectId) : null);
    if (!project) return { humanActor, project: null, projectRole: null };
    if (isPlatformAdmin(humanActor)) {
      return { humanActor, project, projectRole: 'platform_admin' };
    }
    const isOwner = Number(project.created_by) === Number(humanActor.id);
    const member = this.getProjectMember(project.id, humanActor.id);
    return {
      humanActor,
      project,
      projectRole: normalizeProjectRole(member && member.role, isOwner)
    };
  }

  can(actor, action, resource = {}) {
    if (!ALL_ACTIONS.has(action)) return false;
    const context = this.resolveContext(actor, resource);
    if (!context.humanActor || !context.projectRole) return false;

    let humanAllowed = false;
    if (context.projectRole === 'platform_admin') {
      humanAllowed = true;
    } else if (context.projectRole === 'project_admin') {
      humanAllowed = PROJECT_ADMIN_ACTIONS.has(action);
      if (action === ACTIONS.DELETE_PROJECT) {
        humanAllowed = Number(context.project.created_by) === Number(context.humanActor.id);
      }
    } else if (context.projectRole === 'project_member') {
      humanAllowed = PROJECT_MEMBER_ACTIONS.has(action);
    } else if (context.projectRole === 'legacy_viewer') {
      humanAllowed = LEGACY_VIEWER_ACTIONS.has(action);
    }
    if (!humanAllowed) return false;

    if (!actor || actor.type !== 'agent') return true;
    const delegation = actor.delegation || {};
    if (!AGENT_ALLOWED_ACTIONS.has(action)) return false;
    if (String(delegation.projectId || '') !== String(context.project.id)) return false;
    if (resource.prototypeId && String(delegation.prototypeId || '') !== String(resource.prototypeId)) return false;
    const scopes = new Set(Array.isArray(delegation.scopes) ? delegation.scopes : []);
    return scopes.has(ACTION_SCOPE[action]);
  }

  assertCan(actor, action, resource = {}) {
    if (!this.can(actor, action, resource)) {
      throw new AuthorizationError(action, resource);
    }
    return true;
  }
}

module.exports = {
  ACTIONS,
  AuthorizationError,
  AuthorizationService,
  normalizeProjectRole,
  normalizeRoles
};
