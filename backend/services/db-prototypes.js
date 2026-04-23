const { query, queryOne, run } = require('../database/db');

function getPrototypes({ keyword, categoryId } = {}) {
  let sql = `
    SELECT p.*, c.name as category_name, u.nickname as creator_name
    FROM prototypes p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (keyword) {
    sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (categoryId) {
    sql += ` AND p.category_id = ?`;
    params.push(categoryId);
  }
  
  sql += ` ORDER BY p.updated_at DESC`;
  return query(sql, params);
}

function getPrototypeById(id) {
  const prototype = queryOne(`
    SELECT p.*, c.name as category_name, u.nickname as creator_name
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

function setPrototypeTags(id, tags) {
  run(`DELETE FROM prototype_tags WHERE prototype_id = ?`, [id]);
  if (tags && tags.length > 0) {
    tags.forEach(tag => {
      run(`INSERT INTO prototype_tags (prototype_id, tag_name) VALUES (?, ?)`, [id, tag]);
    });
  }
}

function getCategories() {
  return query(`SELECT * FROM categories ORDER BY id`);
}

function createCategory({ name, description }) {
  const now = new Date().toISOString();
  run(`INSERT INTO categories (name, description, created_at) VALUES (?, ?, ?)`, [name, description || '', now]);
  return queryOne(`SELECT * FROM categories WHERE name = ?`, [name]);
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

function createVersion({ prototypeId, versionNumber, entryFile, syncSource, createdBy, sizeKb, note }) {
  const now = new Date().toISOString();
  run(`
    INSERT INTO prototype_versions (prototype_id, version_number, entry_file, sync_source, created_by, size_kb, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [prototypeId, versionNumber, entryFile || '', syncSource || 'upload', createdBy || null, sizeKb || 0, note || '', now]);
  return queryOne(`SELECT * FROM prototype_versions WHERE prototype_id = ? AND version_number = ?`, [prototypeId, versionNumber]);
}

function deleteVersion(id) {
  run(`DELETE FROM prototype_versions WHERE id = ?`, [id]);
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

// 从旧JSON迁移数据
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
  setPrototypeTags,
  getCategories,
  createCategory,
  getReadme,
  saveReadme,
  migrateFromJson,
  getVersions,
  createVersion,
  deleteVersion,
  getLatestVersionNumber
};
