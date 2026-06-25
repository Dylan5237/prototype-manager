const { query, queryOne, run } = require('../database/db');

function getPrototypes({ keyword, categoryId, createdBy, sharedTo, accessibleBy, page, pageSize } = {}) {
  const selectFields = `
    p.*, c.name as category_name, u.nickname as creator_name,
    (SELECT COUNT(*) FROM prototype_visits v WHERE v.prototype_id = p.id) as visit_count,
    (SELECT COALESCE(MAX(version_number), 0) FROM prototype_versions WHERE prototype_id = p.id) as version,
    (SELECT version_label FROM prototype_versions WHERE prototype_id = p.id ORDER BY version_number DESC LIMIT 1) as version_label
  `;
  const fromSql = `
    FROM prototypes p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE 1=1
  `;
  let whereSql = '';
  const params = [];

  if (keyword) {
    whereSql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (categoryId) {
    whereSql += ` AND p.category_id = ?`;
    params.push(categoryId);
  }
  if (createdBy) {
    whereSql += ` AND p.created_by = ?`;
    params.push(createdBy);
  }
  if (sharedTo) {
    whereSql += ` AND p.id IN (SELECT prototype_id FROM prototype_shares WHERE user_id = ?)`;
    params.push(sharedTo);
  }
  if (accessibleBy) {
    whereSql += ` AND (p.created_by = ? OR p.id IN (SELECT prototype_id FROM prototype_shares WHERE user_id = ?))`;
    params.push(accessibleBy, accessibleBy);
  }

  whereSql += ` AND p.deleted_at IS NULL`;
  const orderSql = ` ORDER BY p.updated_at DESC`;

  // 总数统计
  const countSql = `SELECT COUNT(*) as total` + fromSql + whereSql;
  const countRow = queryOne(countSql, params);
  const total = countRow ? countRow.total : 0;

  // 分页数据
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const limit = Math.max(1, parseInt(pageSize, 10) || 12);
  const offset = (currentPage - 1) * limit;

  const dataSql = `SELECT ${selectFields}` + fromSql + whereSql + orderSql + ` LIMIT ? OFFSET ?`;
  const dataParams = [...params, limit, offset];
  const list = query(dataSql, dataParams);

  return { list, total };
}

function getPrototypeById(id) {
  const prototype = queryOne(`
    SELECT p.*, c.name as category_name, u.nickname as creator_name,
      (SELECT COUNT(*) FROM prototype_visits v WHERE v.prototype_id = p.id) as visit_count,
      (SELECT COALESCE(MAX(version_number), 0) FROM prototype_versions WHERE prototype_id = p.id) as version,
      (SELECT version_label FROM prototype_versions WHERE prototype_id = p.id ORDER BY version_number DESC LIMIT 1) as version_label
    FROM prototypes p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `, [id]);
  
  if (!prototype) return null;
  
  // 获取标签
  const tags = query(`SELECT tag_name FROM prototype_tags WHERE prototype_id = ?`, [id]);
  prototype.tags = tags.map(t => t.tag_name);
  
  return prototype;
}

function createPrototype({ id, name, description, githubUrl, categoryId, createdBy }) {
  const now = new Date().toISOString();
  run(`
    INSERT INTO prototypes (id, name, description, github_url, category_id, created_by, created_at, updated_at, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, name, description || '', githubUrl || '', categoryId || null, createdBy, now, now, githubUrl ? 'syncing' : 'pending']);
  return getPrototypeById(id);
}

function updatePrototype(id, { name, description, githubUrl, categoryId, entryFile, syncStatus, syncError }) {
  const fields = [];
  const values = [];
  
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (githubUrl !== undefined) { fields.push('github_url = ?'); values.push(githubUrl); }
  if (categoryId !== undefined) { fields.push('category_id = ?'); values.push(categoryId); }
  if (entryFile !== undefined) { fields.push('entry_file = ?'); values.push(entryFile); }
  if (syncStatus !== undefined) { fields.push('sync_status = ?'); values.push(syncStatus); }
  if (syncError !== undefined) { fields.push('sync_error = ?'); values.push(syncError); }
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  if (fields.length === 1) return getPrototypeById(id); // 只有updated_at
  
  run(`UPDATE prototypes SET ${fields.join(', ')} WHERE id = ?`, values);
  return getPrototypeById(id);
}

function deletePrototype(id) {
  run(`DELETE FROM prototypes WHERE id = ?`, [id]);
}

// 软删除：设置 deleted_at
function softDeletePrototype(id) {
  const now = new Date().toISOString();
  run(`UPDATE prototypes SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
}

// 获取回收站列表
function getRecycleBinPrototypes() {
  return query(`
    SELECT p.*, c.name as category_name, u.nickname as creator_name,
      (SELECT COALESCE(MAX(version_number), 0) FROM prototype_versions WHERE prototype_id = p.id) as version,
      (SELECT version_label FROM prototype_versions WHERE prototype_id = p.id ORDER BY version_number DESC LIMIT 1) as version_label
    FROM prototypes p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.deleted_at IS NOT NULL
    ORDER BY p.deleted_at DESC
  `);
}

// 恢复原型
function restorePrototype(id) {
  const now = new Date().toISOString();
  run(`UPDATE prototypes SET deleted_at = NULL, updated_at = ? WHERE id = ?`, [now, id]);
}

// 彻底删除（硬删除）
function hardDeletePrototype(id) {
  run(`DELETE FROM prototypes WHERE id = ?`, [id]);
}

function setPrototypeTags(id, tags) {
  run(`DELETE FROM prototype_tags WHERE prototype_id = ?`, [id]);
  if (tags && tags.length > 0) {
    tags.forEach(tag => {
      run(`INSERT INTO prototype_tags (prototype_id, tag_name) VALUES (?, ?)`, [id, tag]);
    });
  }
}

// 转移原型归属者
function transferPrototype(prototypeId, newOwnerId) {
  run(`UPDATE prototypes SET created_by = ?, updated_at = ? WHERE id = ?`,
    [newOwnerId, new Date().toISOString(), prototypeId]);
  return getPrototypeById(prototypeId);
}

function getCategories() {
  return query(`SELECT * FROM categories ORDER BY id`);
}

function getCategoryById(id) {
  return queryOne(`SELECT * FROM categories WHERE id = ?`, [id]);
}

function createCategory({ name, description }) {
  const now = new Date().toISOString();
  run(`INSERT INTO categories (name, description, created_at) VALUES (?, ?, ?)`, [name, description || '', now]);
  return queryOne(`SELECT * FROM categories WHERE name = ?`, [name]);
}

function updateCategory(id, { name, description }) {
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (fields.length === 0) return getCategoryById(id);
  values.push(id);
  run(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);
  return getCategoryById(id);
}

function deleteCategory(id) {
  // 将引用该分类的原型解除关联
  run(`UPDATE prototypes SET category_id = NULL WHERE category_id = ?`, [id]);
  run(`DELETE FROM categories WHERE id = ?`, [id]);
}

// 版本管理
function getVersions(prototypeId) {
  return query(`
    SELECT v.*, u.nickname as creator_name
    FROM prototype_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.prototype_id = ?
    ORDER BY v.version_number DESC
  `, [prototypeId]);
}

// SemVer: 根据当前版本标签和升级类型计算新版本号
function bumpVersion(currentLabel, bumpType) {
  const parts = currentLabel
    ? currentLabel.replace(/^v/, '').split('.').map(Number)
    : [0, 0, 0];
  const [major, minor, patch] = parts.map(n => isNaN(n) ? 0 : n);
  switch (bumpType) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return `${major}.${minor}.${patch + 1}`;
  }
}

function createVersion({ prototypeId, versionNumber, entryFile, syncSource, createdBy, sizeKb, note, versionType }) {
  const now = new Date().toISOString();
  // 计算 SemVer 标签
  const prev = queryOne(
    `SELECT version_label FROM prototype_versions WHERE prototype_id = ? ORDER BY version_number DESC LIMIT 1`,
    [prototypeId]
  );
  const currentLabel = prev ? prev.version_label || '' : '';
  const versionLabel = versionNumber === 1 ? '1.0.0' : bumpVersion(currentLabel, versionType);
  run(`
    INSERT INTO prototype_versions (prototype_id, version_number, entry_file, sync_source, created_by, size_kb, note, version_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [prototypeId, versionNumber, entryFile || '', syncSource || 'upload', createdBy || null, sizeKb || 0, note || '', versionLabel, now]);
  return queryOne(`SELECT * FROM prototype_versions WHERE prototype_id = ? AND version_number = ?`, [prototypeId, versionNumber]);
}

function deleteVersion(id) {
  run(`DELETE FROM prototype_versions WHERE id = ?`, [id]);
}

function updateVersionNote(id, note) {
  const existing = queryOne(`SELECT * FROM prototype_versions WHERE id = ?`, [id]);
  if (!existing) return null;
  run(`UPDATE prototype_versions SET note = ? WHERE id = ?`, [note || '', id]);
  return queryOne(`SELECT * FROM prototype_versions WHERE id = ?`, [id]);
}

// 分享管理
function getPrototypeShares(prototypeId) {
  return query(`
    SELECT s.*, u.username, u.nickname
    FROM prototype_shares s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.prototype_id = ?
    ORDER BY s.created_at DESC
  `, [prototypeId]);
}

function getSharedUserIds(prototypeId) {
  const rows = query(`SELECT user_id FROM prototype_shares WHERE prototype_id = ?`, [prototypeId]);
  return rows.map(r => r.user_id);
}

function addPrototypeShare(prototypeId, userId) {
  const now = new Date().toISOString();
  run(`
    INSERT OR IGNORE INTO prototype_shares (prototype_id, user_id, created_at)
    VALUES (?, ?, ?)
  `, [prototypeId, userId, now]);
  return getPrototypeShares(prototypeId);
}

function removePrototypeShare(prototypeId, userId) {
  run(`DELETE FROM prototype_shares WHERE prototype_id = ? AND user_id = ?`, [prototypeId, userId]);
  return getPrototypeShares(prototypeId);
}

// ===== 免登录分享短链 =====
function createShareLink({ code, prototypeId, entryFile, createdBy }) {
  const now = new Date().toISOString();
  run(`
    INSERT INTO share_links (code, prototype_id, entry_file, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [code, prototypeId, entryFile, createdBy || null, now]);
  return queryOne(`SELECT * FROM share_links WHERE code = ?`, [code]);
}

function getShareLinkByCode(code) {
  return queryOne(`SELECT * FROM share_links WHERE code = ?`, [code]);
}

function findShareLink(prototypeId, entryFile) {
  return queryOne(
    `SELECT * FROM share_links WHERE prototype_id = ? AND entry_file = ? ORDER BY created_at DESC LIMIT 1`,
    [prototypeId, entryFile]
  );
}

function getLatestVersionNumber(prototypeId) {
  const result = queryOne(`SELECT MAX(version_number) as max_version FROM prototype_versions WHERE prototype_id = ?`, [prototypeId]);
  return result && result.max_version ? result.max_version : 0;
}

// README缓存
function getReadme(prototypeId) {
  return queryOne(`SELECT * FROM readme_cache WHERE prototype_id = ?`, [prototypeId]);
}

function saveReadme(prototypeId, { content, filePath }) {
  const now = new Date().toISOString();
  const existing = getReadme(prototypeId);
  if (existing) {
    run(`UPDATE readme_cache SET content = ?, file_path = ?, updated_at = ? WHERE prototype_id = ?`,
      [content, filePath, now, prototypeId]);
  } else {
    run(`INSERT INTO readme_cache (prototype_id, content, file_path, updated_at) VALUES (?, ?, ?, ?)`,
      [prototypeId, content, filePath, now]);
  }
}

// 从旧Json迁移数据
function migrateFromJson(prototypes) {
  if (!prototypes || prototypes.length === 0) return;
  
  // 确保有默认用户
  const admin = queryOne(`SELECT id FROM users WHERE username = ?`, ['admin']);
  const defaultUserId = admin ? admin.id : 1;
  
  prototypes.forEach(p => {
    try {
      const now = p.createdAt || new Date().toISOString();
      run(`
        INSERT OR IGNORE INTO prototypes (id, name, description, github_url, entry_file, created_by, created_at, updated_at, sync_status, sync_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        p.id, p.name || '', p.description || '', p.githubUrl || '', p.entryFile || null,
        defaultUserId, now, p.updatedAt || now, p.syncStatus || 'pending', p.syncError || null
      ]);
    } catch (e) {
      console.log(`[迁移] 跳过原型 ${p.id}:`, e.message);
    }
  });
  console.log(`[迁移] 已导入 ${prototypes.length} 个原型`);
}

module.exports = {
  getPrototypes,
  getPrototypeById,
  createPrototype,
  updatePrototype,
  deletePrototype,
  softDeletePrototype,
  getRecycleBinPrototypes,
  restorePrototype,
  hardDeletePrototype,
  setPrototypeTags,
  transferPrototype,
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getReadme,
  saveReadme,
  migrateFromJson,
  getVersions,
  createVersion,
  deleteVersion,
  updateVersionNote,
  getLatestVersionNumber,
  bumpVersion,
  getPrototypeShares,
  getSharedUserIds,
  addPrototypeShare,
  removePrototypeShare,
  createShareLink,
  getShareLinkByCode,
  findShareLink
};
