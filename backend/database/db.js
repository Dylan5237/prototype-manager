const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { applyCollaborationSchema } = require('./collaboration-schema');

const DEFAULT_DB_PATH = path.join(__dirname, '../data/app.db');

let db = null;
let SQL = null;
let activeDbPath = DEFAULT_DB_PATH;
let persistDatabase = true;
let transactionDepth = 0;
let writeQueue = Promise.resolve();

async function initDatabase(options = {}) {
  SQL = await initSqlJs();
  if (db) {
    db.close();
    db = null;
  }
  activeDbPath = path.resolve(options.path || process.env.FUXI_DB_PATH || DEFAULT_DB_PATH);
  persistDatabase = options.persist !== false;
  
  if (fs.existsSync(activeDbPath)) {
    const filebuffer = fs.readFileSync(activeDbPath);
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

  // MCP 设备会话表：记录一次已授权的 MCP 接入，refresh token 只存哈希
  db.run(`
    CREATE TABLE IF NOT EXISTS mcp_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      refresh_token_hash TEXT NOT NULL,
      device_label TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      mcp_version TEXT,
      skill_version TEXT,
      runtime_version TEXT,
      platform TEXT,
      last_reported_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 迁移：为旧 MCP 会话补上本地组件版本回报字段。
  for (const [column, type] of [
    ['mcp_version', 'TEXT'],
    ['skill_version', 'TEXT'],
    ['runtime_version', 'TEXT'],
    ['platform', 'TEXT'],
    ['last_reported_at', 'TEXT']
  ]) {
    try { db.run(`ALTER TABLE mcp_sessions ADD COLUMN ${column} ${type}`); } catch (e) { /* 字段已存在 */ }
  }

  // MCP 一次性连接码表：用户在平台发起接入时生成，短命且单次使用
  db.run(`
    CREATE TABLE IF NOT EXISTS mcp_connect_codes (
      code_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // MCP/Skill 发布清单：release_id 不复用，制品摘要和兼容条件随 manifest 固定。
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_releases (
      release_id TEXT PRIMARY KEY,
      channel TEXT NOT NULL DEFAULT 'stable',
      mcp_version TEXT NOT NULL,
      skill_version TEXT NOT NULL,
      api_schema_version TEXT,
      min_node_version TEXT,
      manifest_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_by INTEGER,
      created_at TEXT NOT NULL,
      published_at TEXT NOT NULL,
      withdrawn_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // 用户确认的延后更新意图：浏览器只写 scheduled，launcher 启动时 claim。
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_update_intents (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      release_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      requested_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      local_mcp_version TEXT,
      local_skill_version TEXT,
      error_code TEXT,
      error_message TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (session_id) REFERENCES mcp_sessions(id),
      FOREIGN KEY (release_id) REFERENCES agent_releases(release_id)
    )
  `);
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_sessions_user ON mcp_sessions(user_id)`); } catch (e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_connect_codes_user ON mcp_connect_codes(user_id)`); } catch (e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_agent_releases_channel_status ON agent_releases(channel, status, published_at)`); } catch (e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_agent_update_intents_session ON agent_update_intents(session_id, status, requested_at)`); } catch (e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_agent_update_intents_user ON agent_update_intents(user_id, updated_at)`); } catch (e) {}

  // 团队协同增量结构：保留旧表和数据，只新增字段、领域表和索引。
  applyCollaborationSchema(db);
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
  if (!db || !persistDatabase) return;
  fs.mkdirSync(path.dirname(activeDbPath), { recursive: true });
  const data = db.export();
  fs.writeFileSync(activeDbPath, Buffer.from(data));
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// 执行SQL（INSERT/UPDATE/DELETE）
function run(sql, params = []) {
  const result = db.run(sql, params);
  if (transactionDepth === 0) saveDatabase();
  return result;
}

function runInTransaction(work) {
  if (typeof work !== 'function') throw new TypeError('work 必须是函数');
  if (transactionDepth > 0) return work(db);

  db.run('BEGIN IMMEDIATE TRANSACTION');
  transactionDepth += 1;
  try {
    const result = work(db);
    if (result && typeof result.then === 'function') {
      throw new TypeError('runInTransaction 只接受同步函数；异步写请使用 enqueueWrite');
    }
    db.run('COMMIT');
    transactionDepth -= 1;
    saveDatabase();
    return result;
  } catch (error) {
    try { db.run('ROLLBACK'); } catch (rollbackError) { /* 保留原始错误 */ }
    transactionDepth = Math.max(0, transactionDepth - 1);
    throw error;
  }
}

function enqueueWrite(work) {
  if (typeof work !== 'function') return Promise.reject(new TypeError('work 必须是函数'));
  const execute = async () => {
    db.run('BEGIN IMMEDIATE TRANSACTION');
    transactionDepth += 1;
    try {
      const result = await work(db);
      db.run('COMMIT');
      transactionDepth -= 1;
      saveDatabase();
      return result;
    } catch (error) {
      try { db.run('ROLLBACK'); } catch (rollbackError) { /* 保留原始错误 */ }
      transactionDepth = Math.max(0, transactionDepth - 1);
      throw error;
    }
  };
  const queued = writeQueue.then(execute, execute);
  writeQueue = queued.catch(() => undefined);
  return queued;
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

function closeDatabase() {
  if (db) db.close();
  db = null;
  SQL = null;
  transactionDepth = 0;
  writeQueue = Promise.resolve();
}

function getDatabasePath() {
  return activeDbPath;
}

module.exports = {
  initDatabase,
  getDb,
  run,
  query,
  queryOne,
  saveDatabase,
  runInTransaction,
  enqueueWrite,
  closeDatabase,
  getDatabasePath
};
