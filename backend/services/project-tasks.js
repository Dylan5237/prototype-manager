const crypto = require('crypto');

const { query, queryOne, runInTransaction } = require('../database/db');
const { ACTIONS, AuthorizationService, normalizeRoles } = require('./authorization');
const { getProjectById, getProjectMember } = require('./db-projects');
const { normalizeVersionStrategy } = require('./version-strategy');
const { ensureUsageTask, getUsageTaskByRef, cancelUsageTask } = require('./usage-tasks');

const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

class ProjectTaskError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = 'ProjectTaskError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function now(clock) {
  return clock().toISOString();
}

function taskId() {
  return `task_${crypto.randomUUID().replace(/-/g, '')}`;
}

function isPlatformAdmin(actor) {
  const roles = normalizeRoles(actor && (actor.roles || actor.role));
  return roles.includes('admin') || roles.includes('platform_admin');
}

function getWritableMember(projectId, userId) {
  const project = getProjectById(projectId);
  if (!project) return null;
  if (Number(project.created_by) === Number(userId)) return { user_id: Number(userId), role: 'owner' };
  const member = getProjectMember(projectId, Number(userId));
  return member && member.role !== 'viewer' ? member : null;
}

function decorateTask(row) {
  if (!row) return null;
  const assignments = query(`
    SELECT ta.*, u.username, u.nickname
    FROM task_assignments ta JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ? ORDER BY CASE ta.assignment_role WHEN 'responsible' THEN 0 ELSE 1 END, ta.id
  `, [row.id]);
  return {
    ...row,
    taskId: row.id,
    assignments,
    responsible: assignments.find(item => item.assignment_role === 'responsible' && ['assigned', 'accepted'].includes(item.acceptance_status)) || null
  };
}

function attachCandidateSummaries(tasks) {
  if (!tasks.length) return tasks;
  const ids = tasks.map(task => task.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = query(
    `SELECT task_id, status, COUNT(*) AS count FROM candidate_submissions WHERE task_id IN (${placeholders}) GROUP BY task_id, status`,
    ids
  );
  const byTask = new Map();
  rows.forEach(row => {
    const current = byTask.get(row.task_id) || { candidate_count: 0, pending_candidate_count: 0 };
    const count = Number(row.count || 0);
    current.candidate_count += count;
    if (['submitted', 'ready'].includes(row.status)) current.pending_candidate_count += count;
    byTask.set(row.task_id, current);
  });
  return tasks.map(task => {
    const summary = byTask.get(task.id) || { candidate_count: 0, pending_candidate_count: 0 };
    return {
      ...task,
      candidate_count: summary.candidate_count,
      pending_candidate_count: summary.pending_candidate_count
    };
  });
}

function selectTask(taskIdValue) {
  return queryOne(`
    SELECT pt.*, pn.label AS node_label, pn.node_type, pp.prototype_id, pp.menu_path,
      p.name AS prototype_name, requester.username AS requester_username, requester.nickname AS requester_name
    FROM project_tasks pt
    JOIN project_nodes pn ON pn.id = pt.node_id
    JOIN project_prototypes pp ON pp.id = pt.binding_id
    JOIN prototypes p ON p.id = pp.prototype_id
    JOIN users requester ON requester.id = pt.requested_by
    WHERE pt.id = ?
  `, [taskIdValue]);
}

class ProjectTaskService {
  constructor({ clock = () => new Date(), authorization = new AuthorizationService() } = {}) {
    this.clock = clock;
    this.authorization = authorization;
  }

  getTask({ actor, projectId, taskId: id }) {
    this.authorization.assertCan(actor, ACTIONS.VIEW_CHANGE, { type: 'project_task', projectId });
    const task = selectTask(id);
    if (!task || String(task.project_id) !== String(projectId)) throw new ProjectTaskError('TASK_NOT_FOUND', '任务不存在', 404);
    return attachCandidateSummaries([decorateTask(task)])[0];
  }

  listTasks({ actor, projectId, nodeId, status, assignedTo }) {
    this.authorization.assertCan(actor, ACTIONS.VIEW_CHANGE, { type: 'project_task', projectId });
    const clauses = ['pt.project_id = ?'];
    const params = [projectId];
    if (nodeId) { clauses.push('pt.node_id = ?'); params.push(nodeId); }
    if (status) { clauses.push('pt.status = ?'); params.push(status); }
    if (assignedTo) {
      clauses.push(`EXISTS (SELECT 1 FROM task_assignments filter_ta WHERE filter_ta.task_id = pt.id AND filter_ta.user_id = ? AND filter_ta.acceptance_status != 'revoked')`);
      params.push(Number(assignedTo));
    }
    const rows = query(`
      SELECT pt.*, pn.label AS node_label, pn.node_type, pp.prototype_id, pp.menu_path,
        p.name AS prototype_name, requester.username AS requester_username, requester.nickname AS requester_name
      FROM project_tasks pt
      JOIN project_nodes pn ON pn.id = pt.node_id
      JOIN project_prototypes pp ON pp.id = pt.binding_id
      JOIN prototypes p ON p.id = pp.prototype_id
      JOIN users requester ON requester.id = pt.requested_by
      WHERE ${clauses.join(' AND ')} ORDER BY pt.updated_at DESC
    `, params).map(decorateTask);
    return attachCandidateSummaries(rows);
  }

  createTask({ actor, projectId, nodeId, bindingId, title, requirement, responsibleUserId, participantUserIds = [], versionStrategy = {}, source = 'web', isTest = false, exclusionReason = null }) {
    this.authorization.assertCan(actor, ACTIONS.START_CHANGE, { type: 'project_task', projectId });
    const cleanTitle = String(title || '').trim();
    const cleanRequirement = String(requirement || '').trim();
    if (!cleanTitle || cleanTitle.length > 120) throw new ProjectTaskError('INVALID_TASK_TITLE', '任务标题不能为空且不能超过 120 字');
    if (!cleanRequirement || cleanRequirement.length > 4000) throw new ProjectTaskError('INVALID_TASK_REQUIREMENT', '任务要求不能为空且不能超过 4000 字');
    const node = queryOne(`SELECT * FROM project_nodes WHERE id = ? AND project_id = ? AND status = 'active'`, [nodeId, projectId]);
    if (!node || node.node_type !== 'work') throw new ProjectTaskError('TASK_NODE_INVALID', '任务必须关联有效的工作节点', 409);
    const binding = queryOne(`SELECT * FROM project_prototypes WHERE id = ? AND project_id = ? AND node_id = ? AND unbound_at IS NULL`, [Number(bindingId), projectId, nodeId]);
    if (!binding) throw new ProjectTaskError('TASK_BINDING_INVALID', '任务绑定必须属于所选工作节点', 409);
    const baseVersion = queryOne(`SELECT id, version_number, version_label FROM prototype_versions WHERE prototype_id = ? ORDER BY version_number DESC LIMIT 1`, [binding.prototype_id]);
    if (!baseVersion) throw new ProjectTaskError('BASE_VERSION_MISSING', '该原型还没有可追溯的正式版本，不能创建协作任务', 409);
    const responsibleId = Number(responsibleUserId);
    if (!Number.isInteger(responsibleId) || !getWritableMember(projectId, responsibleId)) throw new ProjectTaskError('TASK_RESPONSIBLE_INVALID', '任务负责人必须是项目负责人、管理员或编辑者');
    const participants = [...new Set(participantUserIds.map(Number))].filter(id => id !== responsibleId);
    if (participants.some(id => !Number.isInteger(id) || !getWritableMember(projectId, id))) throw new ProjectTaskError('TASK_PARTICIPANT_INVALID', '参与者必须是项目负责人、管理员或编辑者');
    let strategy;
    try { strategy = normalizeVersionStrategy(versionStrategy, baseVersion.version_label || '0.0.0'); }
    catch (error) { throw new ProjectTaskError('INVALID_VERSION_STRATEGY', error.message); }
    const id = taskId();
    const createdAt = now(this.clock);
    runInTransaction(db => {
      db.run(`INSERT INTO project_tasks
        (id, project_id, node_id, binding_id, base_version_id, base_version_number, requested_by, title, requirement, version_strategy_type, version_strategy_value, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?)`,
      [id, projectId, nodeId, binding.id, baseVersion.id, baseVersion.version_number, actor.id, cleanTitle, cleanRequirement, strategy.type, strategy.value, createdAt, createdAt]);
      db.run(`INSERT INTO task_assignments (task_id, user_id, assignment_role, acceptance_status, assigned_by, assigned_at, updated_at) VALUES (?, ?, 'responsible', 'assigned', ?, ?, ?)`, [id, responsibleId, actor.id, createdAt, createdAt]);
      participants.forEach(userId => db.run(`INSERT INTO task_assignments (task_id, user_id, assignment_role, acceptance_status, assigned_by, assigned_at, updated_at) VALUES (?, ?, 'participant', 'assigned', ?, ?, ?)`, [id, userId, actor.id, createdAt, createdAt]));
      db.run(`INSERT INTO audit_events (id, actor_user_id, action, resource_type, resource_id, result, metadata_json, created_at) VALUES (?, ?, 'project_task.created', 'project_task', ?, 'success', ?, ?)`, [crypto.randomUUID(), actor.id, id, JSON.stringify({ projectId, nodeId, bindingId: binding.id, responsibleUserId: responsibleId }), createdAt]);
    });
    ensureUsageTask({
      taskKind: 'project',
      actorUserId: actor.id,
      prototypeId: binding.prototype_id,
      projectId,
      sourceRef: id,
      source,
      isTest,
      exclusionReason,
      startedAt: createdAt
    });
    return decorateTask(selectTask(id));
  }

  acceptTask({ actor, projectId, taskId: id }) {
    const task = this.getTask({ actor, projectId, taskId: id });
    const assignment = task.assignments.find(item => item.assignment_role === 'responsible' && item.acceptance_status === 'assigned');
    if (!assignment || Number(assignment.user_id) !== Number(actor.id)) throw new ProjectTaskError('TASK_ACCEPT_FORBIDDEN', '仅当前任务负责人可以接受任务', 403);
    if (task.status !== 'assigned') throw new ProjectTaskError('TASK_STATUS_CONFLICT', '当前任务状态不能接受', 409);
    const acceptedAt = now(this.clock);
    const expiresAt = new Date(this.clock().getTime() + HANDOFF_TTL_MS).toISOString();
    const handoffCode = `FXT-${crypto.randomBytes(24).toString('base64url')}`;
    const handoffId = `task_handoff_${crypto.randomUUID().replace(/-/g, '')}`;
    runInTransaction(db => {
      db.run(`UPDATE task_assignments SET acceptance_status = 'accepted', responded_at = ?, updated_at = ? WHERE id = ?`, [acceptedAt, acceptedAt, assignment.id]);
      db.run(`UPDATE project_tasks SET status = 'in_progress', updated_at = ? WHERE id = ?`, [acceptedAt, id]);
      db.run(`INSERT INTO project_task_handoffs (id, task_id, task_assignment_id, code_hash, issued_by, issued_to_user_id, scopes_json, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?)`, [handoffId, id, assignment.id, crypto.createHash('sha256').update(handoffCode).digest('hex'), actor.id, actor.id, JSON.stringify(['task:view', 'candidate:submit']), expiresAt, acceptedAt]);
    });
    return { task: decorateTask(selectTask(id)), handoffCode, expiresAt };
  }

  declineTask({ actor, projectId, taskId: id }) {
    const task = this.getTask({ actor, projectId, taskId: id });
    const assignment = task.assignments.find(item => item.assignment_role === 'responsible' && item.acceptance_status === 'assigned');
    if (!assignment || Number(assignment.user_id) !== Number(actor.id)) throw new ProjectTaskError('TASK_DECLINE_FORBIDDEN', '仅当前任务负责人可以拒绝任务', 403);
    if (task.status !== 'assigned') throw new ProjectTaskError('TASK_STATUS_CONFLICT', '当前任务状态不能拒绝', 409);
    const changedAt = now(this.clock);
    runInTransaction(db => {
      db.run(`UPDATE task_assignments SET acceptance_status = 'declined', responded_at = ?, ended_at = ?, updated_at = ? WHERE id = ?`, [changedAt, changedAt, changedAt, assignment.id]);
      db.run(`UPDATE project_tasks SET updated_at = ? WHERE id = ?`, [changedAt, id]);
    });
    return decorateTask(selectTask(id));
  }

  reassignTask({ actor, projectId, taskId: id, responsibleUserId }) {
    const task = this.getTask({ actor, projectId, taskId: id });
    const project = getProjectById(projectId);
    if (!isPlatformAdmin(actor) && Number(project.created_by) !== Number(actor.id) && Number(task.requested_by) !== Number(actor.id)) throw new ProjectTaskError('TASK_REASSIGN_FORBIDDEN', '仅项目负责人或任务发起人可以重新指派', 403);
    if (!['assigned', 'in_progress'].includes(task.status)) throw new ProjectTaskError('TASK_STATUS_CONFLICT', '当前任务状态不能重新指派', 409);
    const userId = Number(responsibleUserId);
    if (!Number.isInteger(userId) || !getWritableMember(projectId, userId)) throw new ProjectTaskError('TASK_RESPONSIBLE_INVALID', '任务负责人必须是项目负责人、管理员或编辑者');
    const changedAt = now(this.clock);
    runInTransaction(db => {
      db.run(`UPDATE task_assignments SET acceptance_status = 'revoked', ended_at = ?, updated_at = ? WHERE task_id = ? AND assignment_role = 'responsible' AND acceptance_status != 'revoked'`, [changedAt, changedAt, id]);
      db.run(`UPDATE project_task_handoffs SET status = 'revoked', revoked_at = ? WHERE task_id = ? AND status = 'issued'`, [changedAt, id]);
      db.run(`INSERT INTO task_assignments (task_id, user_id, assignment_role, acceptance_status, assigned_by, assigned_at, updated_at) VALUES (?, ?, 'responsible', 'assigned', ?, ?, ?)`, [id, userId, actor.id, changedAt, changedAt]);
      db.run(`UPDATE project_tasks SET status = 'assigned', updated_at = ? WHERE id = ?`, [changedAt, id]);
    });
    return decorateTask(selectTask(id));
  }

  cancelTask({ actor, projectId, taskId: id, source = 'web' }) {
    const task = this.getTask({ actor, projectId, taskId: id });
    const project = getProjectById(projectId);
    if (!isPlatformAdmin(actor) && Number(project.created_by) !== Number(actor.id) && Number(task.requested_by) !== Number(actor.id)) throw new ProjectTaskError('TASK_CANCEL_FORBIDDEN', '仅项目负责人或任务发起人可以取消任务', 403);
    if (['completed', 'cancelled'].includes(task.status)) throw new ProjectTaskError('TASK_STATUS_CONFLICT', '任务已结束', 409);
    const pendingReview = queryOne(
      `SELECT COUNT(*) AS count FROM candidate_submissions WHERE task_id = ? AND status IN ('submitted','ready')`,
      [id]
    );
    if (Number(pendingReview && pendingReview.count) > 0) {
      throw new ProjectTaskError('TASK_HAS_PENDING_REVIEW', '存在待审核候选，不能取消任务', 409);
    }
    const changedAt = now(this.clock);
    runInTransaction(db => {
      db.run(`UPDATE project_tasks SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`, [changedAt, changedAt, id]);
      db.run(`UPDATE task_assignments SET acceptance_status = 'revoked', ended_at = ?, updated_at = ? WHERE task_id = ? AND acceptance_status IN ('assigned','accepted')`, [changedAt, changedAt, id]);
      db.run(`UPDATE project_task_handoffs SET status = 'revoked', revoked_at = ? WHERE task_id = ? AND status = 'issued'`, [changedAt, id]);
    });
    const usageTask = getUsageTaskByRef('project', id);
    if (usageTask) cancelUsageTask(usageTask.id, { completedAt: changedAt, outcome: 'cancelled' });
    return decorateTask(selectTask(id));
  }
}

module.exports = { ProjectTaskError, ProjectTaskService };
