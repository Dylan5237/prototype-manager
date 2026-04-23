const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getPrototypes, getPrototypeById, createPrototype, updatePrototype, deletePrototype,
  setPrototypeTags, getCategories, createCategory, getReadme, migrateFromJson,
  getVersions, createVersion, deleteVersion, getLatestVersionNumber
} = require('../services/db-prototypes');
const { generateId, ensureRepoDir, removeRepoDir, scanFiles, findEntryFile, UPLOADS_DIR,
  saveCurrentVersion, getDirSizeKb, rollbackVersion, removeVersionDir, cleanupOldVersions
} = require('../services/storage');
const { syncFromGitHub, parseGitHubUrl } = require('../services/github');
const { extractReadme } = require('../services/readme-extractor');
const { marked } = require('marked');

// 文件上传配置
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('只支持zip文件'));
    }
  }
});

// 获取所有原型
router.get('/', requireAuth, (req, res) => {
  const { keyword, category_id } = req.query;
  const prototypes = getPrototypes({ keyword, categoryId: category_id });
  res.json({ success: true, data: prototypes });
});

// 获取单个原型详情
router.get('/:id', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  const repoDir = path.join(__dirname, '../repos', prototype.id);
  let files = [];
  if (fs.existsSync(repoDir)) {
    files = scanFiles(repoDir);
  }
  
  res.json({
    success: true,
    data: { ...prototype, files }
  });
});

// 创建原型
router.post('/', requireAuth, requireRole(['admin', 'uploader']), async (req, res) => {
  const { name, description, githubUrl, categoryId, tags } = req.body;
  
  if (!name) {
    return res.status(400).json({ success: false, message: '名称不能为空' });
  }
  
  const id = generateId();
  const prototype = createPrototype({
    id, name, description, githubUrl, categoryId,
    createdBy: req.user.id
  });
  
  if (tags && tags.length > 0) {
    setPrototypeTags(id, tags);
  }
  
  if (githubUrl) {
    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      return res.status(400).json({ success: false, message: 'GitHub链接格式不正确' });
    }
    
    updatePrototype(id, { syncStatus: 'syncing' });
    const result = await syncFromGitHub(id, githubUrl);
    
    if (result.success) {
      const repoDir = path.join(__dirname, '../repos', id);
      const entryFile = findEntryFile(repoDir);
      updatePrototype(id, { entryFile, syncStatus: 'success' });
      extractReadme(id);
    } else {
      updatePrototype(id, { syncStatus: 'failed', syncError: result.error });
    }
    
    const updated = getPrototypeById(id);
    return res.json({ success: true, data: updated });
  }
  
  res.json({ success: true, data: getPrototypeById(id) });
});

// 上传zip文件
router.post('/:id/upload', requireAuth, upload.single('file'), (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  // 权限检查：仅创建人或admin可上传
  if (req.user.role !== 'admin' && prototype.created_by !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  if (!req.file) {
    return res.status(400).json({ success: false, message: '没有上传文件' });
  }
  
  try {
    // 保存当前版本到历史
    const repoDir = path.join(__dirname, '../repos', prototype.id);
    let versionsBackupDir = null;
    if (fs.existsSync(repoDir)) {
      const latestVersion = getLatestVersionNumber(prototype.id);
      const currentEntryFile = findEntryFile(repoDir);
      const currentSize = getDirSizeKb(repoDir);
      const saved = saveCurrentVersion(prototype.id, latestVersion + 1);
      if (saved) {
        createVersion({
          prototypeId: prototype.id,
          versionNumber: latestVersion + 1,
          entryFile: currentEntryFile,
          syncSource: prototype.sync_status === 'uploaded' || prototype.sync_status === 'success' ? 'upload' : 'initial',
          createdBy: prototype.created_by,
          sizeKb: currentSize,
          note: req.body.versionNote || ''
        });
      }
      // 备份versions目录，防止removeRepoDir删除它
      const versionsDir = path.join(repoDir, 'versions');
      if (fs.existsSync(versionsDir)) {
        versionsBackupDir = path.join(__dirname, '../uploads', `versions_backup_${prototype.id}_${Date.now()}`);
        fs.renameSync(versionsDir, versionsBackupDir);
      }
    }
    
    removeRepoDir(prototype.id);
    const newRepoDir = ensureRepoDir(prototype.id);
    
    // 恢复versions目录
    if (versionsBackupDir && fs.existsSync(versionsBackupDir)) {
      const versionsDest = path.join(newRepoDir, 'versions');
      fs.mkdirSync(path.dirname(versionsDest), { recursive: true });
      fs.renameSync(versionsBackupDir, versionsDest);
    }
    
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(repoDir, true);
    
    // 智能处理嵌套目录
    // 1. 如果只有一个目录，直接提升
    let items = fs.readdirSync(repoDir, { withFileTypes: true });
    if (items.length === 1 && items[0].isDirectory()) {
      const nestedDir = path.join(repoDir, items[0].name);
      const tempDir = path.join(__dirname, '../uploads', `temp_${prototype.id}`);
      fs.renameSync(nestedDir, tempDir);
      fs.rmSync(repoDir, { recursive: true });
      fs.renameSync(tempDir, repoDir);
    } else if (items.length > 1) {
      // 2. 多个条目时，查找包含index.html的子目录并提升其内容
      for (const item of items) {
        if (item.isDirectory()) {
          const subDir = path.join(repoDir, item.name);
          if (findEntryFile(subDir)) {
            // 将该子目录的内容提升到repoDir（构建产物优先覆盖根目录文件）
            const tempDir = path.join(__dirname, '../uploads', `temp_flat_${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });
            // 先移动根目录的其他文件（除要提升的子目录外）
            for (const other of items) {
              if (other.name !== item.name) {
                fs.renameSync(path.join(repoDir, other.name), path.join(tempDir, other.name));
              }
            }
            // 再移动子目录内容（覆盖冲突文件，如index.html）
            const subItems = fs.readdirSync(subDir);
            for (const si of subItems) {
              const srcPath = path.join(subDir, si);
              const destPath = path.join(tempDir, si);
              if (fs.existsSync(destPath)) {
                fs.rmSync(destPath, { recursive: true, force: true });
              }
              fs.renameSync(srcPath, destPath);
            }
            fs.rmSync(subDir, { recursive: true });
            fs.rmSync(repoDir, { recursive: true });
            fs.renameSync(tempDir, repoDir);
            break;
          }
        }
      }
    }
    
    fs.unlinkSync(req.file.path);
    
    const entryFile = findEntryFile(newRepoDir);
    updatePrototype(prototype.id, { entryFile, syncStatus: 'uploaded' });
    extractReadme(prototype.id);
    
    // 清理旧版本，保留最近10个
    cleanupOldVersions(prototype.id, 10);
    
    res.json({ success: true, data: getPrototypeById(prototype.id) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 同步GitHub
router.post('/:id/sync', requireAuth, async (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  if (req.user.role !== 'admin' && prototype.created_by !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  if (!prototype.github_url) {
    return res.status(400).json({ success: false, message: '该原型没有绑定GitHub链接' });
  }
  
  // 保存当前版本到历史
  const repoDir = path.join(__dirname, '../repos', prototype.id);
  let versionsBackupDir = null;
  if (fs.existsSync(repoDir)) {
    const latestVersion = getLatestVersionNumber(prototype.id);
    const currentEntryFile = findEntryFile(repoDir);
    const currentSize = getDirSizeKb(repoDir);
    const saved = saveCurrentVersion(prototype.id, latestVersion + 1);
    if (saved) {
      createVersion({
        prototypeId: prototype.id,
        versionNumber: latestVersion + 1,
        entryFile: currentEntryFile,
        syncSource: 'github',
        createdBy: req.user.id,
        sizeKb: currentSize,
        note: req.body.versionNote || ''
      });
    }
    // 备份versions目录，防止syncFromGitHub中的removeRepoDir删除它
    const versionsDir = path.join(repoDir, 'versions');
    if (fs.existsSync(versionsDir)) {
      versionsBackupDir = path.join(__dirname, '../uploads', `versions_backup_${prototype.id}_${Date.now()}`);
      fs.renameSync(versionsDir, versionsBackupDir);
    }
  }
  
  updatePrototype(prototype.id, { syncStatus: 'syncing' });
  const result = await syncFromGitHub(prototype.id, prototype.github_url);
  
  // 恢复versions目录
  if (versionsBackupDir && fs.existsSync(versionsBackupDir)) {
    const restoredRepoDir = path.join(__dirname, '../repos', prototype.id);
    const versionsDest = path.join(restoredRepoDir, 'versions');
    if (!fs.existsSync(path.dirname(versionsDest))) {
      fs.mkdirSync(path.dirname(versionsDest), { recursive: true });
    }
    fs.renameSync(versionsBackupDir, versionsDest);
  }
  
  if (result.success) {
    const repoDir = path.join(__dirname, '../repos', prototype.id);
    const entryFile = findEntryFile(repoDir);
    updatePrototype(prototype.id, { entryFile, syncStatus: 'success' });
    delete prototype.sync_error;
    extractReadme(prototype.id);
    // 清理旧版本，保留最近10个
    cleanupOldVersions(prototype.id, 10);
  } else {
    updatePrototype(prototype.id, { syncStatus: 'failed', syncError: result.error });
  }
  
  res.json({ success: result.success, data: getPrototypeById(prototype.id) });
});

// 版本管理API

// 获取版本列表
router.get('/:id/versions', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  const versions = getVersions(req.params.id);
  res.json({ success: true, data: versions });
});

// 回滚到指定版本
router.post('/:id/versions/:versionId/rollback', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (req.user.role !== 'admin' && prototype.created_by !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  const version = req.params.versionId;
  // versionId 可能是数字ID或 v1/v2 格式
  let versionNumber;
  if (version.startsWith('v')) {
    versionNumber = parseInt(version.replace(/^v/, ''), 10);
  } else {
    // 通过数据库ID查找版本号
    const allVersions = getVersions(req.params.id);
    const found = allVersions.find(v => v.id == version);
    if (!found) {
      return res.status(404).json({ success: false, message: '版本不存在' });
    }
    versionNumber = found.version_number;
  }
  
  const success = rollbackVersion(prototype.id, versionNumber);
  if (!success) {
    return res.status(500).json({ success: false, message: '回滚失败' });
  }
  
  // 更新原型的entry_file
  const repoDir = path.join(__dirname, '../repos', prototype.id);
  const entryFile = findEntryFile(repoDir);
  updatePrototype(prototype.id, { entryFile });
  
  res.json({ success: true, data: getPrototypeById(prototype.id) });
});

// 删除历史版本
router.delete('/:id/versions/:versionId', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (req.user.role !== 'admin' && prototype.created_by !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  const versionId = parseInt(req.params.versionId, 10);
  const allVersions = getVersions(req.params.id);
  const found = allVersions.find(v => v.id === versionId);
  if (!found) {
    return res.status(404).json({ success: false, message: '版本不存在' });
  }
  
  // 删除文件
  removeVersionDir(prototype.id, found.version_number);
  // 删除数据库记录
  deleteVersion(versionId);
  
  res.json({ success: true });
});

// 更新原型信息
router.put('/:id', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  if (req.user.role !== 'admin' && prototype.created_by !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  const { name, description, githubUrl, categoryId } = req.body;
  const updated = updatePrototype(prototype.id, { name, description, githubUrl, categoryId });
  
  res.json({ success: true, data: updated });
});

// 删除原型
router.delete('/:id', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  if (req.user.role !== 'admin' && prototype.created_by !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  removeRepoDir(prototype.id);
  deletePrototype(prototype.id);
  res.json({ success: true });
});

// 获取文件内容
router.get('/:id/content/*', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  const filePath = req.params[0];
  const fullPath = path.join(__dirname, '../repos', prototype.id, filePath);
  const repoDir = path.resolve(__dirname, '../repos', prototype.id);
  const resolvedPath = path.resolve(fullPath);
  if (!resolvedPath.startsWith(repoDir)) {
    return res.status(403).json({ success: false, message: '非法路径' });
  }
  
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ success: false, message: '文件不存在' });
  }
  
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    return res.status(400).json({ success: false, message: '不能读取目录内容' });
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  res.json({ success: true, data: { path: filePath, content } });
});

// 获取README
router.get('/:id/readme', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  const readme = getReadme(prototype.id);
  if (!readme) {
    return res.json({ success: true, data: null });
  }
  
  // 服务端渲染Markdown为HTML
  const html = marked(readme.content || '');
  res.json({ success: true, data: { ...readme, html } });
});

// 分类API
router.get('/categories/list', requireAuth, (req, res) => {
  res.json({ success: true, data: getCategories() });
});

router.post('/categories', requireAuth, requireRole(['admin']), (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: '名称不能为空' });
  }
  try {
    const category = createCategory({ name, description });
    res.json({ success: true, data: category });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, message: '分类名称已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { router, migrateFromJson };
