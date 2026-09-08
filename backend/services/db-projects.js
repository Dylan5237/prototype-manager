const { run, query, queryOne, getDb, saveDatabase } = require('../database/db');

function insertAndGetId(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  return result[0].values[0][0];
}
const { generateId, rollbackVersion, findEntryFile, getRepoPath } = require('./storage');
const { getPrototypeById, updatePrototype } = require('./db-prototypes');

class PrototypeProjectConflictError extends Error {
  constructor({ prototypeId, projectId, existingProjectId, existingProjectName }) {
    super(`原型已归属项目「${existingProjectName || existingProjectId}」，请先解除原项目关联`);
    this.name = 'PrototypeProjectConflictError';
    this.code = 'PROTOTYPE_ALREADY_BOUND';
    this.status = 409;
    this.details = { prototypeId, projectId, existingProjectId, existingProjectName };
  }
}

class BindingRemovalConflictError extends Error {
  constructor(details) {
    super(details.activeCheckout ? '原型仍处于签出状态，请先签入或释放签出' : '原型仍有未完成任务或待确认候选，请先处理后再解绑');
    this.name = 'BindingRemovalConflictError';
    this.code = details.activeCheckout ? 'BINDING_HAS_ACTIVE_CHECKOUT' : 'BINDING_HAS_ACTIVE_CHANGES';
    this.status = 409;
    this.details = details;
  }
}

class NodeAssignmentConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'NodeAssignmentConflictError';
    this.code = 'MEMBER_HAS_NODE_ASSIGNMENTS';
    this.status = 409;
    this.details = details;
  }
}

function now() {
  return new Date().toISOString();
}

function addHours(dateStr, hours) {
  const d = new Date(dateStr);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function getProjectNodes(projectId, { includeInactive = false } = {}) {
  return query(`
    SELECT pn.*,
      owner.user_id AS owner_id, owner_user.username AS owner_username, owner_user.nickname AS owner_name,
      (SELECT COUNT(*) FROM node_assignments na WHERE na.project_node_id = pn.id AND na.assignment_role = 'contributor' AND na.status = 'active') AS contributor_count
    FROM project_nodes pn
    LEFT JOIN node_assignments owner ON owner.project_node_id = pn.id AND owner.assignment_role = 'owner' AND owner.status = 'active'
    LEFT JOIN users owner_user ON owner_user.id = owner.user_id
    WHERE pn.project_id = ? ${includeInactive ? '' : "AND pn.status = 'active'"}
    ORDER BY pn.depth, pn.sort_order, pn.created_at
  `, [projectId]);
}

function getProjectNodeById(nodeId) {
  return queryOne(`SELECT * FROM project_nodes WHERE id = ?`, [nodeId]);
}

function getNodeAssignments(nodeId) {
  return query(`
    SELECT na.*, u.username, u.nickname
    FROM node_assignments na
    JOIN users u ON u.id = na.user_id
    WHERE na.project_node_id = ? AND na.status = 'active'
    ORDER BY CASE na.assignment_role WHEN 'owner' THEN 0 ELSE 1 END, na.created_at
  `, [nodeId]);
}

function setNodeAssignments({ projectId, nodeId, ownerId, contributorIds = [], assignedBy }) {
  const node = queryOne(`SELECT * FROM project_nodes WHERE id = ? AND project_id = ? AND status = 'active'`, [nodeId, projectId]);
  if (!node) throw new Error('工作节点不存在');
  const project = getProjectById(projectId);
  const userIds = [...new Set([ownerId, ...contributorIds].filter(Boolean).map(Number))];
  for (const userId of userIds) {
    if (Number(project.created_by) === userId) continue;
    const member = getProjectMember(projectId, userId);
    if (!member || member.role === 'viewer') throw new Error('节点负责人和参与者必须是项目负责人、管理员或编辑者');
  }
  const t = now();
  const db = getDb();
  db.run('BEGIN TRANSACTION');
  try {
    db.run(`UPDATE node_assignments SET status = 'inactive', updated_at = ? WHERE project_node_id = ? AND status = 'active'`, [t, nodeId]);
    const upsert = (userId, role) => db.run(`
      INSERT INTO node_assignments (project_node_id, user_id, assignment_role, status, assigned_by, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(project_node_id, user_id, assignment_role)
      DO UPDATE SET status = 'active', assigned_by = excluded.assigned_by, updated_at = excluded.updated_at
    `, [nodeId, userId, role, assignedBy || null, t, t]);
    if (ownerId) upsert(Number(ownerId), 'owner');
    for (const userId of [...new Set(contributorIds.map(Number))]) {
      if (userId !== Number(ownerId)) upsert(userId, 'contributor');
    }
    db.run('COMMIT');
    saveDatabase();
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
  return getNodeAssignments(nodeId);
}

function nodesToMenuConfig(nodes) {
  const childrenByParent = new Map();
  for (const node of nodes) {
    const key = node.parent_id || '__root__';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(node);
  }
  const build = parentId => (childrenByParent.get(parentId || '__root__') || []).map(node => ({
    id: node.id,
    key: node.node_key,
    label: node.label,
    children: build(node.id)
  }));
  return { items: build(null) };
}

function findProjectNodeByPath(projectId, menuPath) {
  const segments = String(menuPath || '').split('/').filter(Boolean);
  let parentId = null;
  let current = null;
  for (const segment of segments) {
    const parentClause = parentId ? 'parent_id = ?' : 'parent_id IS NULL';
    const params = parentId ? [projectId, segment, parentId] : [projectId, segment];
    current = queryOne(`SELECT * FROM project_nodes WHERE project_id = ? AND node_key = ? AND status = 'active' AND ${parentClause}`, params);
    if (!current) return null;
    parentId = current.id;
  }
  return current;
}

function syncProjectNodes(db, projectId, menuConfig, timestamp, bindingMigrations = []) {
  const existingRows = getProjectNodes(projectId, { includeInactive: true });
  const existing = new Map(existingRows.map(node => [node.id, node]));
  const migratingBindingIds = new Set(bindingMigrations.map(item => Number(item.bindingId)));
  const seen = new Set();
  const normalize = (nodes, parentId = null, depth = 1) => (Array.isArray(nodes) ? nodes : []).map((node, index) => {
    if (depth > 3) throw new Error('项目菜单最多支持三级');
    const id = node.id || generateId();
    const previous = existing.get(id);
    if (previous && previous.project_id !== projectId) throw new Error('工作节点不属于当前项目');
    if (seen.has(id)) throw new Error('工作节点 ID 不能重复');
    seen.add(id);
    const children = normalize(node.children || [], id, depth + 1);
    const nodeType = children.length ? 'group' : 'work';
    if (previous) {
      db.run(`UPDATE project_nodes SET parent_id = ?, node_key = ?, label = ?, node_type = ?, depth = ?, sort_order = ?, status = 'active', updated_at = ? WHERE id = ?`, [parentId, node.key, node.label, nodeType, depth, index, timestamp, id]);
    } else {
      db.run(`INSERT INTO project_nodes (id, project_id, parent_id, node_key, label, node_type, depth, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`, [id, projectId, parentId, node.key, node.label, nodeType, depth, index, timestamp, timestamp]);
    }
    return { id, key: node.key, label: node.label, children };
  });
  const normalizedItems = normalize(menuConfig?.items || []);
  for (const oldNode of existingRows) {
    if (seen.has(oldNode.id) || oldNode.status !== 'active') continue;
    const binding = queryOne(`SELECT id FROM project_prototypes WHERE node_id = ? AND unbound_at IS NULL`, [oldNode.id]);
    const change = queryOne(`SELECT id FROM prototype_changes WHERE node_id = ? AND status IN ('editing','preview_pending','ready','invalid')`, [oldNode.id]);
    if ((binding && !migratingBindingIds.has(Number(binding.id))) || change) throw new Error(`工作节点「${oldNode.label}」仍有绑定或未完成任务，不能移除`);
    db.run(`UPDATE project_nodes SET status = 'inactive', updated_at = ? WHERE id = ?`, [timestamp, oldNode.id]);
  }
  return { items: normalizedItems };
}

// =================== 项目基础 CRUD ===================

function createProject({ name, description, menuConfig, createdBy }) {
  const id = generateId();
  const t = now();
  const db = getDb();
  db.run('BEGIN TRANSACTION');
  try {
    db.run(`INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, name, description || '', '{"items":[]}', createdBy, t, t]);
    const normalizedMenu = syncProjectNodes(db, id, menuConfig || { items: [] }, t);
    db.run(`UPDATE projects SET menu_config = ? WHERE id = ?`, [JSON.stringify(normalizedMenu), id]);
    db.run('COMMIT');
    saveDatabase();
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
  return getProjectById(id);
}

function projectListQuery({ keyword, createdBy, memberOf, accessibleBy, pendingOnly } = {}) {
  const selectSql = `
    SELECT p.*, u.nickname as creator_name,
      (SELECT COUNT(*) FROM project_prototypes pp WHERE pp.project_id = p.id AND pp.unbound_at IS NULL) AS prototype_count,
      (1 + (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id)) AS member_count,
      (SELECT COUNT(*) FROM prototype_changes c
        WHERE c.project_id = p.id AND c.status = 'ready') AS pending_candidate_count,
      COALESCE(
        (SELECT MAX(e.occurred_at) FROM usage_events e
          WHERE e.resource_type = 'project' AND e.resource_id = p.id),
        p.updated_at
      ) AS last_activity_at
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.deleted_at IS NULL
  `;
  const countSql = `
    SELECT COUNT(*) AS total
    FROM projects p
    WHERE p.deleted_at IS NULL
  `;
  let whereSql = '';
  const params = [];
  if (keyword) {
    whereSql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (createdBy) {
    whereSql += ` AND p.created_by = ?`;
    params.push(createdBy);
  }
  if (memberOf) {
    whereSql += ` AND EXISTS (SELECT 1 FROM project_members pm_scope WHERE pm_scope.project_id = p.id AND pm_scope.user_id = ?)`;
    params.push(memberOf);
  }
  if (accessibleBy) {
    whereSql += ` AND (p.created_by = ? OR EXISTS (SELECT 1 FROM project_members pm_scope WHERE pm_scope.project_id = p.id AND pm_scope.user_id = ?))`;
    params.push(accessibleBy, accessibleBy);
  }
  if (pendingOnly) {
    whereSql += ` AND EXISTS (SELECT 1 FROM prototype_changes c_scope WHERE c_scope.project_id = p.id AND c_scope.status = 'ready')`;
  }
  return {
    sql: `${selectSql}${whereSql} ORDER BY p.updated_at DESC`,
    countSql: `${countSql}${whereSql}`,
    params
  };
}

function getProjects(options = {}) {
  const { sql, params } = projectListQuery(options);
  return query(sql, params);
}

function getProjectsPage(options = {}) {
  const { sql, countSql, params } = projectListQuery(options);
  const countRow = queryOne(countSql, params);
  const total = Number(countRow?.total || 0);
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(options.pageSize, 10) || 12));
  const list = query(`${sql} LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]);
  return { list, total, page, pageSize };
}

function getProjectById(id) {
  const project = queryOne(`
    SELECT p.*, u.nickname as creator_name
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ? AND p.deleted_at IS NULL
  `, [id]);
  if (!project) return null;
  const nodes = getProjectNodes(id);
  if (nodes.length) project.menu_config = nodesToMenuConfig(nodes);
  else try { project.menu_config = JSON.parse(project.menu_config || '{"items":[]}'); } catch (e) { project.menu_config = { items: [] }; }
  project.nodes = nodes;
  return project;
}

function updateProject(id, { name, description, menuConfig, bindingMigrations = [] }) {
  const db = getDb();
  db.run('BEGIN TRANSACTION');
  try {
    const t = now();
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (menuConfig !== undefined) {
      const normalizedMenu = syncProjectNodes(db, id, menuConfig, t, bindingMigrations);
      fields.push('menu_config = ?'); values.push(JSON.stringify(normalizedMenu));
    }
    fields.push('updated_at = ?'); values.push(t); values.push(id);
    db.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);
    for (const migration of bindingMigrations) {
      const existing = queryOne(`SELECT id, menu_path, node_id FROM project_prototypes WHERE id = ? AND project_id = ? AND unbound_at IS NULL`, [migration.bindingId, id]);
      if (!existing || existing.menu_path !== migration.fromPath) {
        throw new Error('原型绑定已发生变化，请刷新项目后重试');
      }
      const targetNode = findProjectNodeByPath(id, migration.toPath);
      if (!targetNode || targetNode.node_type !== 'work') throw new Error('绑定只能迁移到叶子工作节点');
      db.run(`UPDATE project_prototypes SET node_id = ?, menu_path = ? WHERE id = ? AND project_id = ?`, [targetNode.id, migration.toPath, migration.bindingId, id]);
    }
    db.run('COMMIT');
    saveDatabase();
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
  return getProjectById(id);
}

function softDeleteProject(id) {
  run(`UPDATE projects SET deleted_at = ? WHERE id = ?`, [now(), id]);
}

// =================== 项目-原型绑定 ===================

function bindPrototype({ projectId, prototypeId, menuPath, nodeId, sortOrder = 0 }) {
  const t = now();
  const node = nodeId
    ? queryOne(`SELECT * FROM project_nodes WHERE id = ? AND project_id = ? AND status = 'active'`, [nodeId, projectId])
    : findProjectNodeByPath(projectId, menuPath);
  if (!node) throw new Error('工作节点不存在');
  if (node.node_type !== 'work') throw new Error('原型只能绑定到叶子工作节点');
  nodeId = node.id;
  const existing = findBinding(projectId, prototypeId, menuPath, { includeUnbound: true });
  if (existing && !existing.unbound_at) {
    if (existing.node_id !== nodeId) run(`UPDATE project_prototypes SET node_id = ? WHERE id = ?`, [nodeId, existing.id]);
    return getProjectPrototypeById(existing.id);
  }
  if (existing?.unbound_at) {
    run(`UPDATE project_prototypes SET unbound_at = NULL, unbound_by = NULL, node_id = ?, sort_order = ?, created_at = ? WHERE id = ?`, [nodeId, sortOrder, t, existing.id]);
    return getProjectPrototypeById(existing.id);
  }
  const otherProject = queryOne(`
    SELECT pp.project_id, p.name AS project_name
    FROM project_prototypes pp
    LEFT JOIN projects p ON p.id = pp.project_id
    WHERE pp.prototype_id = ? AND pp.project_id <> ? AND pp.unbound_at IS NULL
    ORDER BY pp.id ASC
    LIMIT 1
  `, [prototypeId, projectId]);
  if (otherProject) {
    throw new PrototypeProjectConflictError({
      prototypeId,
      projectId,
      existingProjectId: otherProject.project_id,
      existingProjectName: otherProject.project_name
    });
  }
  const id = insertAndGetId(`
    INSERT INTO project_prototypes (project_id, prototype_id, node_id, menu_path, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [projectId, prototypeId, nodeId, menuPath, sortOrder, t]);
  return getProjectPrototypeById(id);
}

function findBinding(projectId, prototypeId, menuPath, { includeUnbound = false } = {}) {
  return queryOne(`
    SELECT * FROM project_prototypes
    WHERE project_id = ? AND prototype_id = ? AND menu_path = ?
      ${includeUnbound ? '' : 'AND unbound_at IS NULL'}
  `, [projectId, prototypeId, menuPath]);
}

function getProjectPrototypeById(id) {
  return queryOne(`SELECT * FROM project_prototypes WHERE id = ?`, [id]);
}

function getProjectPrototypes(projectId) {
  return query(`
    SELECT pp.*, p.name as prototype_name, p.description as prototype_description,
      p.entry_file, p.github_url, p.created_by as prototype_created_by,
      u.nickname as prototype_creator_name,
      (SELECT COALESCE(MAX(version_number), 0) FROM prototype_versions WHERE prototype_id = p.id) as version_number,
      (SELECT version_label FROM prototype_versions WHERE prototype_id = p.id ORDER BY version_number DESC LIMIT 1) as version_label
    FROM project_prototypes pp
    LEFT JOIN prototypes p ON pp.prototype_id = p.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE pp.project_id = ? AND pp.unbound_at IS NULL
    ORDER BY pp.sort_order ASC, pp.id ASC
  `, [projectId]);
}

function getPrototypeProjectBinding(prototypeId) {
  const rows = query(`
    SELECT pp.id AS binding_id, pp.project_id, pp.prototype_id, pp.node_id, pp.menu_path, pp.sort_order,
      pp.created_at AS bound_at, p.name AS project_name, p.description AS project_description,
      p.created_by AS project_owner_id
    FROM project_prototypes pp
    LEFT JOIN projects p ON p.id = pp.project_id
    WHERE pp.prototype_id = ? AND p.deleted_at IS NULL AND pp.unbound_at IS NULL
    ORDER BY pp.project_id, pp.sort_order, pp.id
  `, [prototypeId]);
  if (!rows.length) return null;
  const first = rows[0];
  return {
    project_id: first.project_id,
    project_name: first.project_name,
    project_description: first.project_description,
    project_owner_id: first.project_owner_id,
    menu_positions: rows.map(row => ({
      binding_id: row.binding_id,
      node_id: row.node_id,
      menu_path: row.menu_path,
      sort_order: row.sort_order,
      bound_at: row.bound_at
    }))
  };
}

function updateProjectPrototype(id, { menuPath, nodeId, sortOrder }) {
  const fields = [];
  const values = [];
  const currentBinding = queryOne(`SELECT * FROM project_prototypes WHERE id = ? AND unbound_at IS NULL`, [id]);
  if (!currentBinding) return null;
  if (menuPath !== undefined || nodeId !== undefined) {
    const targetNode = nodeId
      ? queryOne(`SELECT * FROM project_nodes WHERE id = ? AND project_id = ? AND status = 'active'`, [nodeId, currentBinding.project_id])
      : findProjectNodeByPath(currentBinding.project_id, menuPath);
    if (!targetNode || targetNode.node_type !== 'work') throw new Error('绑定只能迁移到叶子工作节点');
    fields.push('node_id = ?'); values.push(targetNode.id);
  }
  if (menuPath !== undefined) { fields.push('menu_path = ?'); values.push(menuPath); }
  if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
  if (fields.length === 0) return getProjectPrototypeById(id);
  values.push(id);
  run(`UPDATE project_prototypes SET ${fields.join(', ')} WHERE id = ? AND unbound_at IS NULL`, values);
  return getProjectPrototypeById(id);
}

function removeProjectPrototype(id, { projectId, userId } = {}) {
  const binding = queryOne(`SELECT * FROM project_prototypes WHERE id = ? AND unbound_at IS NULL`, [id]);
  if (!binding || (projectId && String(binding.project_id) !== String(projectId))) return null;
  const activeCheckout = queryOne(`SELECT id, user_id, expires_at FROM project_checkouts WHERE project_prototype_id = ? AND status = 'active' AND expires_at > ?`, [id, now()]);
  const activeChanges = query(`SELECT id, title, status FROM prototype_changes WHERE project_id = ? AND prototype_id = ? AND status IN ('editing','preview_pending','ready','invalid') ORDER BY updated_at DESC`, [binding.project_id, binding.prototype_id]);
  if (activeCheckout || activeChanges.length) throw new BindingRemovalConflictError({ activeCheckout, activeChanges });
  const unboundAt = now();
  run(`UPDATE project_prototypes SET unbound_at = ?, unbound_by = ? WHERE id = ? AND unbound_at IS NULL`, [unboundAt, userId || null, id]);
  return { ...binding, unbound_at: unboundAt, unbound_by: userId || null };
}

// =================== 项目成员 ===================

function addProjectMember({ projectId, userId, role = 'editor' }) {
  const t = now();
  run(`
    INSERT OR REPLACE INTO project_members (project_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?)
  `, [projectId, userId, role, t]);
  return getProjectMember(projectId, userId);
}

function getProjectMember(projectId, userId) {
  return queryOne(`
    SELECT pm.*, u.username, u.nickname
    FROM project_members pm
    LEFT JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ? AND pm.user_id = ?
  `, [projectId, userId]);
}

function getProjectMembers(projectId) {
  return query(`
    SELECT pm.*, u.username, u.nickname
    FROM project_members pm
    LEFT JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
    ORDER BY pm.created_at DESC
  `, [projectId]);
}

function removeProjectMember(projectId, userId) {
  const assignments = query(`
    SELECT pn.id AS node_id, pn.label, na.assignment_role
    FROM node_assignments na JOIN project_nodes pn ON pn.id = na.project_node_id
    WHERE pn.project_id = ? AND na.user_id = ? AND na.status = 'active'
  `, [projectId, userId]);
  if (assignments.length) throw new NodeAssignmentConflictError('成员仍负责或参与项目节点，请先调整节点分工', { assignments });
  run(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`, [projectId, userId]);
}

// =================== 签出 / 签入 ===================

function cleanupExpiredCheckouts(projectId) {
  const sql = projectId
    ? `UPDATE project_checkouts SET status = 'expired' WHERE status = 'active' AND expires_at < ? AND project_id = ?`
    : `UPDATE project_checkouts SET status = 'expired' WHERE status = 'active' AND expires_at < ?`;
  const params = projectId ? [now(), projectId] : [now()];
  run(sql, params);
}

function getActiveCheckout(projectPrototypeId) {
  return queryOne(`
    SELECT pc.*, u.username, u.nickname
    FROM project_checkouts pc
    LEFT JOIN users u ON pc.user_id = u.id
    WHERE pc.project_prototype_id = ? AND pc.status = 'active'
  `, [projectPrototypeId]);
}

function checkoutPrototype({ projectId, projectPrototypeId, userId, note = '', durationHours = 24 }) {
  cleanupExpiredCheckouts(projectId);
  const existing = getActiveCheckout(projectPrototypeId);
  if (existing) {
    if (existing.user_id === userId) {
      return existing;
    }
    throw new Error('该模块已被其他人签出');
  }
  const t = now();
  const expiresAt = addHours(t, durationHours);
  const id = insertAndGetId(`
    INSERT INTO project_checkouts (project_id, project_prototype_id, user_id, checked_out_at, expires_at, status, note)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `, [projectId, projectPrototypeId, userId, t, expiresAt, note]);
  return queryOne(`SELECT * FROM project_checkouts WHERE id = ?`, [id]);
}

function checkinPrototype({ projectPrototypeId, userId }) {
  const checkout = getActiveCheckout(projectPrototypeId);
  if (!checkout) return null;
  if (checkout.user_id !== userId) {
    throw new Error('只能签入自己签出的模块');
  }
  run(`UPDATE project_checkouts SET status = 'released' WHERE id = ?`, [checkout.id]);
  return getActiveCheckout(projectPrototypeId) || queryOne(`SELECT * FROM project_checkouts WHERE id = ?`, [checkout.id]);
}

function forceReleaseCheckout({ checkoutId, byAdmin = false }) {
  const checkout = queryOne(`SELECT * FROM project_checkouts WHERE id = ?`, [checkoutId]);
  if (!checkout || checkout.status !== 'active') return null;
  run(`UPDATE project_checkouts SET status = ? WHERE id = ?`, [byAdmin ? 'forced' : 'expired', checkoutId]);
  return queryOne(`SELECT * FROM project_checkouts WHERE id = ?`, [checkoutId]);
}

function getProjectCheckouts(projectId) {
  cleanupExpiredCheckouts(projectId);
  return query(`
    SELECT pc.*, u.username, u.nickname
    FROM project_checkouts pc
    LEFT JOIN users u ON pc.user_id = u.id
    WHERE pc.project_id = ? AND pc.status = 'active'
    ORDER BY pc.checked_out_at DESC
  `, [projectId]);
}

// =================== 快照 ===================

function createSnapshot({ projectId, name, versionLabel, createdBy }) {
  const project = getProjectById(projectId);
  if (!project) throw new Error('项目不存在');
  const bindings = getProjectPrototypes(projectId).map(pp => ({
    prototypeId: pp.prototype_id,
    nodeId: pp.node_id,
    menuPath: pp.menu_path,
    prototypeName: pp.prototype_name,
    versionNumber: pp.version_number,
    versionLabel: pp.version_label,
    entryFile: pp.entry_file
  }));
  const snapshotData = {
    menuConfig: project.menu_config,
    bindings
  };
  const t = now();
  const id = insertAndGetId(`
    INSERT INTO project_snapshots (project_id, name, version_label, snapshot_data, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [projectId, name, versionLabel || '', JSON.stringify(snapshotData), createdBy, t]);
  return getSnapshotById(id);
}

function getSnapshotById(id) {
  const snapshot = queryOne(`SELECT * FROM project_snapshots WHERE id = ?`, [id]);
  if (!snapshot) return null;
  try {
    snapshot.snapshot_data = JSON.parse(snapshot.snapshot_data);
  } catch (e) {
    snapshot.snapshot_data = {};
  }
  return snapshot;
}

function getProjectSnapshots(projectId) {
  return query(`
    SELECT ps.*, u.nickname as creator_name
    FROM project_snapshots ps
    LEFT JOIN users u ON ps.created_by = u.id
    WHERE ps.project_id = ?
    ORDER BY ps.created_at DESC
  `, [projectId]).map(s => {
    try {
      s.snapshot_data = JSON.parse(s.snapshot_data);
    } catch (e) {
      s.snapshot_data = {};
    }
    return s;
  });
}

function restoreSnapshot(snapshotId, { restoredBy }) {
  const snapshot = getSnapshotById(snapshotId);
  if (!snapshot) throw new Error('快照不存在');
  const projectId = snapshot.project_id;
  const data = snapshot.snapshot_data || {};
  const menuConfig = data.menuConfig || { items: [] };
  const bindings = data.bindings || [];

  // 更新项目菜单
  updateProject(projectId, { menuConfig });

  // 重建当前绑定视图，但保留历史绑定、签出与审计引用。
  const t = now();
  run(`UPDATE project_prototypes SET unbound_at = ?, unbound_by = ? WHERE project_id = ? AND unbound_at IS NULL`, [t, restoredBy || null, projectId]);
  bindings.forEach((b, idx) => {
    const historical = findBinding(projectId, b.prototypeId, b.menuPath, { includeUnbound: true });
    if (historical) {
      const targetNode = b.nodeId ? queryOne(`SELECT id FROM project_nodes WHERE id = ? AND project_id = ?`, [b.nodeId, projectId]) : findProjectNodeByPath(projectId, b.menuPath);
      run(`UPDATE project_prototypes SET unbound_at = NULL, unbound_by = NULL, node_id = ?, sort_order = ? WHERE id = ?`, [targetNode?.id || null, idx, historical.id]);
    } else {
      const targetNode = b.nodeId ? queryOne(`SELECT id FROM project_nodes WHERE id = ? AND project_id = ?`, [b.nodeId, projectId]) : findProjectNodeByPath(projectId, b.menuPath);
      run(`
        INSERT INTO project_prototypes (project_id, prototype_id, node_id, menu_path, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [projectId, b.prototypeId, targetNode?.id || null, b.menuPath, idx, t]);
    }
  });

  // 回滚每个原型到快照版本
  const errors = [];
  bindings.forEach(b => {
    if (!b.versionNumber) return;
    try {
      const prototype = getPrototypeById(b.prototypeId);
      if (!prototype) {
        errors.push(`原型 ${b.prototypeId} 不存在`);
        return;
      }
      const success = rollbackVersion(b.prototypeId, b.versionNumber);
      if (!success) {
        errors.push(`原型 ${b.prototypeName || b.prototypeId} 版本 ${b.versionNumber} 回滚失败`);
        return;
      }
      const entryFile = findEntryFile(getRepoPath(b.prototypeId));
      updatePrototype(b.prototypeId, { entryFile });
    } catch (err) {
      errors.push(`原型 ${b.prototypeName || b.prototypeId} 恢复异常: ${err.message}`);
    }
  });

  return {
    snapshot,
    project: getProjectById(projectId),
    errors: errors.length ? errors : undefined
  };
}

function deleteSnapshot(snapshotId) {
  run(`DELETE FROM project_snapshots WHERE id = ?`, [snapshotId]);
}

module.exports = {
  createProject,
  getProjects,
  getProjectsPage,
  getProjectById,
  getProjectNodes,
  updateProject,
  softDeleteProject,

  bindPrototype,
  PrototypeProjectConflictError,
  BindingRemovalConflictError,
  NodeAssignmentConflictError,
  getPrototypeProjectBinding,
  getProjectPrototypeById,
  getProjectPrototypes,
  getProjectNodeById,
  getNodeAssignments,
  setNodeAssignments,
  updateProjectPrototype,
  removeProjectPrototype,

  addProjectMember,
  getProjectMember,
  getProjectMembers,
  removeProjectMember,

  checkoutPrototype,
  checkinPrototype,
  forceReleaseCheckout,
  getActiveCheckout,
  getProjectCheckouts,
  cleanupExpiredCheckouts,

  createSnapshot,
  getSnapshotById,
  getProjectSnapshots,
  restoreSnapshot,
  deleteSnapshot
};
