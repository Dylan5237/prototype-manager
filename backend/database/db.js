const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/app.db');

let db = null;
let SQL = null;

async function initDatabase() {
  SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }
  
  // 创建表结构
  createTables();
  
  // 保存初始数据库
  saveDatabase();
  
  return db;
}

function createTables() {
  // users 表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL
    )
  `);
  
  // categories 表
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    )
  `);
  
  // prototypes 表
  db.run(`
    CREATE TABLE IF NOT EXISTS prototypes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      github_url TEXT,
      entry_file TEXT,
      category_id INTEGER,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      sync_error TEXT,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);
  
  // prototype_tags 表
  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_tags (
      prototype_id TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      PRIMARY KEY (prototype_id, tag_name),
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id) ON DELETE CASCADE
    )
  `);
  
  // prototype_versions 表
  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prototype_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      entry_file TEXT,
      sync_source TEXT,
      created_by INTEGER,
      size_kb INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id) ON DELETE CASCADE
    )
  `);
  
  // 迁移：为旧表添加新字段（如果表已存在但缺少字段）
  try {
    db.run(`ALTER TABLE prototype_versions ADD COLUMN created_by INTEGER`);
  } catch (e) { /* 字段已存在 */ }
  try {
    db.run(`ALTER TABLE prototype_versions ADD COLUMN size_kb INTEGER DEFAULT 0`);
  } catch (e) { /* 字段已存在 */ }
  try {
    db.run(`ALTER TABLE prototype_versions ADD COLUMN note TEXT`);
  } catch (e) { /* 字段已存在 */ }
  try {
    db.run(`ALTER TABLE prototypes ADD COLUMN deleted_at TEXT DEFAULT NULL`);
  } catch (e) { /* 字段已存在 */ }
  try {
    db.run(`ALTER TABLE prototype_versions ADD COLUMN version_label TEXT DEFAULT ''`);
  } catch (e) { /* 字段已存在 */ }

  // 迁移：为旧数据补上 version_label
  migrateVersionLabels();
  
  // readme_cache 表
  db.run(`
    CREATE TABLE IF NOT EXISTS readme_cache (
      prototype_id TEXT PRIMARY KEY,
      content TEXT,
      file_path TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id) ON DELETE CASCADE
    )
  `);
  
  // comments 表
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prototype_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      images TEXT,
      parent_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
    )
  `);

  // comment_images 表
  db.run(`
    CREATE TABLE IF NOT EXISTS comment_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
    )
  `);

  // prototype_visits 表
  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prototype_id TEXT NOT NULL,
      visitor_ip TEXT,
      user_id INTEGER,
      visited_at TEXT NOT NULL,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id) ON DELETE CASCADE
    )
  `);

  // prototype_shares 表：记录原型分享给哪些用户
  db.run(`
    CREATE TABLE IF NOT EXISTS prototype_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prototype_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(prototype_id, user_id)
    )
  `);

  // 迁移：将 users.role 从单值字符串改为 JSON 数组
  migrateRoleToArray();

  // 用户组表
  db.run(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 用户组成员表
  db.run(`
    CREATE TABLE IF NOT EXISTS user_group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(group_id, user_id)
    )
  `);

  // 项目表
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      menu_config TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT DEFAULT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // 项目-原型关联表
  db.run(`
    CREATE TABLE IF NOT EXISTS project_prototypes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      prototype_id TEXT NOT NULL,
      menu_path TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id) ON DELETE CASCADE,
      UNIQUE(project_id, prototype_id, menu_path)
    )
  `);

  // 项目成员表
  db.run(`
    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(project_id, user_id)
    )
  `);

  // 项目签出表
  db.run(`
    CREATE TABLE IF NOT EXISTS project_checkouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      project_prototype_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      checked_out_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      note TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (project_prototype_id) REFERENCES project_prototypes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 项目快照表
  db.run(`
    CREATE TABLE IF NOT EXISTS project_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version_label TEXT,
      snapshot_data TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // 原型分享短链表（免登录查看链接）
  db.run(`
    CREATE TABLE IF NOT EXISTS share_links (
      code TEXT PRIMARY KEY,
      prototype_id TEXT NOT NULL,
      entry_file TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (prototype_id) REFERENCES prototypes(id) ON DELETE CASCADE
    )
  `);
  // 为已存在的旧库补建索引（若表已存在则跳过）
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_share_links_prototype ON share_links(prototype_id)`); } catch (e) {}
}

// 将 role 字段从单值字符串迁移为 JSON 数组格式
function migrateRoleToArray() {
  try {
    const rows = db.run(`SELECT id, role FROM users`).toString();
    // sql.js 的 db.run 不返回结果，需要用 query
  } catch (e) {}
  
  try {
    const stmt = db.prepare(`SELECT id, role FROM users`);
    const toMigrate = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      // 如果不是以 [ 开头，说明是旧格式的单值字符串
      if (row.role && !row.role.startsWith('[')) {
        toMigrate.push({ id: row.id, role: row.role });
      }
    }
    stmt.free();
    
    toMigrate.forEach(({ id, role }) => {
      db.run(`UPDATE users SET role = ? WHERE id = ?`, [JSON.stringify([role]), id]);
    });
    
    if (toMigrate.length > 0) {
      saveDatabase();
      console.log(`[迁移] 已将 ${toMigrate.length} 个用户的 role 迁移为数组格式`);
    }
  } catch (e) {
    // users 表可能还不存在，忽略
  }
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// 执行SQL（INSERT/UPDATE/DELETE）
function run(sql, params = []) {
  const result = db.run(sql, params);
  saveDatabase();
  return result;
}

// 查询多条
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// 查询单条
function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

// 为旧版本数据补上 version_label（version_number=1 → 1.0.0，version_number=N → 1.0.(N-1)）
function migrateVersionLabels() {
  try {
    const stmt = db.prepare(`SELECT id, version_number FROM prototype_versions WHERE version_label = '' OR version_label IS NULL`);
    const toMigrate = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      toMigrate.push(row);
    }
    stmt.free();
    
    if (toMigrate.length === 0) return;
    
    toMigrate.forEach(({ id, version_number }) => {
      const label = version_number === 1 ? '1.0.0' : `1.0.${version_number - 1}`;
      db.run(`UPDATE prototype_versions SET version_label = ? WHERE id = ?`, [label, id]);
    });
    
    saveDatabase();
    console.log(`[迁移] 已为 ${toMigrate.length} 个旧版本补上 version_label`);
  } catch (e) {
    // 表可能还不存在，忽略
  }
}

module.exports = {
  initDatabase,
  getDb,
  run,
  query,
  queryOne,
  saveDatabase
};
