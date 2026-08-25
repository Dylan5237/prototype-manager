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

function now() {
  return new Date().toISOString();
}

function addHours(dateStr, hours) {
  const d = new Date(dateStr);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

// =================== 项目基础 CRUD ===================

function createProject({ name, description, menuConfig, createdBy }) {
  const id = generateId();
  const t = now();
  run(`
    INSERT INTO projects (id, name, description, menu_config, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, name, description || '', JSON.stringify(menuConfig || { items: [] }), createdBy, t, t]);
  return getProjectById(id);
}

function getProjects({ keyword, createdBy } = {}) {
  let sql = `
    SELECT p.*, u.nickname as creator_name
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.deleted_at IS NULL
  `;
  const params = [];
  if (keyword) {
    sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (createdBy) {
    sql += ` AND p.created_by = ?`;
    params.push(createdBy);
  }
  sql += ` ORDER BY p.updated_at DESC`;
  return query(sql, params);
}

function getProjectById(id) {
  const project = queryOne(`
    SELECT p.*, u.nickname as creator_name
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ? AND p.deleted_at IS NULL
  `, [id]);
  if (!project) return null;
  try {
    project.menu_config = JSON.parse(project.menu_config || '{"items":[]}');
  } catch (e) {
    project.menu_config = { items: [] };
  }
  return project;
}

function updateProject(id, { name, description, menuConfig }) {
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (menuConfig !== undefined) { fields.push('menu_config = ?'); values.push(JSON.stringify(menuConfig)); }
  fields.push('updated_at = ?');
  values.push(now());
  values.push(id);
  if (fields.length === 1) return getProjectById(id);
  run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);
  return getProjectById(id);
}

function softDeleteProject(id) {
  run(`UPDATE projects SET deleted_at = ? WHERE id = ?`, [now(), id]);
}

// =================== 项目-原型绑定 ===================

function bindPrototype({ projectId, prototypeId, menuPath, sortOrder = 0 }) {
  const t = now();
  const existing = findBinding(projectId, prototypeId, menuPath);
  if (existing) return existing;
  const otherProject = queryOne(`
    SELECT pp.project_id, p.name AS project_name
    FROM project_prototypes pp
    LEFT JOIN projects p ON p.id = pp.project_id
    WHERE pp.prototype_id = ? AND pp.project_id <> ?
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
    INSERT INTO project_prototypes (project_id, prototype_id, menu_path, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [projectId, prototypeId, menuPath, sortOrder, t]);
  return getProjectPrototypeById(id);
}

function findBinding(projectId, prototypeId, menuPath) {
  return queryOne(`
    SELECT * FROM project_prototypes
    WHERE project_id = ? AND prototype_id = ? AND menu_path = ?
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
    WHERE pp.project_id = ?
    ORDER BY pp.sort_order ASC, pp.id ASC
  `, [projectId]);
}

function getPrototypeProjectBinding(prototypeId) {
  const rows = query(`
    SELECT pp.id AS binding_id, pp.project_id, pp.prototype_id, pp.menu_path, pp.sort_order,
      pp.created_at AS bound_at, p.name AS project_name, p.description AS project_description,
      p.created_by AS project_owner_id
    FROM project_prototypes pp
    LEFT JOIN projects p ON p.id = pp.project_id
    WHERE pp.prototype_id = ? AND p.deleted_at IS NULL
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
      menu_path: row.menu_path,
      sort_order: row.sort_order,
      bound_at: row.bound_at
    }))
  };
}

function updateProjectPrototype(id, { menuPath, sortOrder }) {
  const fields = [];
  const values = [];
  if (menuPath !== undefined) { fields.push('menu_path = ?'); values.push(menuPath); }
  if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
  if (fields.length === 0) return getProjectPrototypeById(id);
  values.push(id);
  run(`UPDATE project_prototypes SET ${fields.join(', ')} WHERE id = ?`, values);
  return getProjectPrototypeById(id);
}

function removeProjectPrototype(id) {
  // 先清理该绑定上的签出记录
  run(`DELETE FROM project_checkouts WHERE project_prototype_id = ?`, [id]);
  run(`DELETE FROM project_prototypes WHERE id = ?`, [id]);
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

  // 重建绑定关系：先删除旧绑定（保留快照中存在的）
  run(`DELETE FROM project_prototypes WHERE project_id = ?`, [projectId]);
  const t = now();
  bindings.forEach((b, idx) => {
    run(`
      INSERT INTO project_prototypes (project_id, prototype_id, menu_path, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [projectId, b.prototypeId, b.menuPath, idx, t]);
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
  getProjectById,
  updateProject,
  softDeleteProject,

  bindPrototype,
  PrototypeProjectConflictError,
  getPrototypeProjectBinding,
  getProjectPrototypeById,
  getProjectPrototypes,
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
