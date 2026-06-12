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

  // 插入默认分类
  const defaultCategories = ['药品管理', '版本控制', '权限系统', '业务流程', '数据看板'];
  defaultCategories.forEach(name => {
    try {
      db.run(
        `INSERT OR IGNORE INTO categories (name, description, created_at) VALUES (?, ?, ?)`,
        [name, '', new Date().toISOString()]
      );
    } catch (e) {}
  });
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

module.exports = {
  initDatabase,
  getDb,
  run,
  query,
  queryOne,
  saveDatabase
};
