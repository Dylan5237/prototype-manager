const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getPrototypes, getPrototypeById, createPrototype, updatePrototype, deletePrototype,
  softDeletePrototype, getRecycleBinPrototypes, restorePrototype, hardDeletePrototype,
  setPrototypeTags, getCategories, getCategoryById, createCategory, updateCategory, deleteCategory,
  getReadme, migrateFromJson, transferPrototype,
  getVersions, createVersion, deleteVersion, updateVersionNote, getLatestVersionNumber,
  getPrototypeShares, getSharedUserIds, addPrototypeShare, removePrototypeShare
} = require('../services/db-prototypes');
const { generateId, ensureRepoDir, removeRepoDir, scanFiles, findEntryFile, UPLOADS_DIR,
  saveCurrentVersion, getDirSizeKb, rollbackVersion, removeVersionDir, cleanupOldVersions
} = require('../services/storage');

const { extractReadme } = require('../services/readme-extractor');
const { marked } = require('marked');
const { createComment, getComments, deleteComment, COMMENT_IMAGES_DIR } = require('../services/db-comments');
const { recordVisit, getVisitStats, getVisitCount } = require('../services/db-stats');

// 辅助函数：判断当前用户是否为管理员
function isAdmin(req) {
  return req.user.roles && req.user.roles.includes('admin');
}

// 判断用户是否为原型的协作者（拥有读写权限）
function isCollaborator(req, prototypeId) {
  return getSharedUserIds(prototypeId).includes(req.user.id);
}

// 是否有权访问原型（查看/预览/下载/统计）
function canAccessPrototype(req, prototype) {
  if (isAdmin(req) || prototype.created_by === req.user.id || isCollaborator(req, prototype.id)) return true;
  // 已登录的普通用户（viewer/uploader）可通过分享链接访问任意原型
  return req.user.roles.some(r => ['viewer', 'uploader'].includes(r));
}

// 是否有权编辑原型（修改/上传/版本管理/删除/协作）
function canEditPrototype(req, prototype) {
  return isAdmin(req) || prototype.created_by === req.user.id || isCollaborator(req, prototype.id);
}

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

// 评论图片上传配置
const commentImageUpload = multer({
  dest: COMMENT_IMAGES_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  }
});

// 获取原型列表
// scope: my（我创建的，默认）| shared（分享给我的）| all（全部可访问的原型：管理员为全部，普通用户为自己的+分享给我的）
router.get('/', requireAuth, (req, res) => {
  const { keyword, category_id, scope } = req.query;
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 12;
  const admin = isAdmin(req);
  let result;

  if (scope === 'shared') {
    result = getPrototypes({ keyword, categoryId: category_id, sharedTo: req.user.id, page, pageSize });
  } else if (scope === 'all' && admin) {
    result = getPrototypes({ keyword, categoryId: category_id, page, pageSize });
  } else if (scope === 'all') {
    // 普通用户查看全部：自己创建的 + 分享给我的
    result = getPrototypes({ keyword, categoryId: category_id, accessibleBy: req.user.id, page, pageSize });
  } else {
    // 默认返回自己创建的
    result = getPrototypes({ keyword, categoryId: category_id, createdBy: req.user.id, page, pageSize });
  }

  res.json({ success: true, data: result.list, total: result.total });
});

// ========== 回收站 ==========

// 获取回收站列表（仅admin）
router.get('/recycle-bin', requireAuth, requireRole(['admin']), (req, res) => {
  const prototypes = getRecycleBinPrototypes();
  res.json({ success: true, data: prototypes });
});

// 恢复原型（admin或创建者）
router.put('/recycle-bin/:id/restore', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (!canEditPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  restorePrototype(req.params.id);
  res.json({ success: true });
});

// 彻底删除（仅admin）
router.delete('/recycle-bin/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  removeRepoDir(req.params.id);
  hardDeletePrototype(req.params.id);
  res.json({ success: true });
});


// 获取单个原型详情
router.get('/:id', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }

  if (!canAccessPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权访问该原型' });
  }

  const repoDir = path.join(__dirname, '../repos', prototype.id);
  let files = [];
  if (fs.existsSync(repoDir)) {
    files = scanFiles(repoDir);
  }

  const sharedUserIds = getSharedUserIds(prototype.id);
  res.json({
    success: true,
    data: { ...prototype, files, shared_user_ids: sharedUserIds }
  });
});

// 下载原型仓库为 ZIP
router.get('/:id/download', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (!canAccessPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权访问该原型' });
  }

  const repoDir = path.join(__dirname, '../repos', prototype.id);
  if (!fs.existsSync(repoDir)) {
    return res.status(404).json({ success: false, message: '原型文件不存在' });
  }

  try {
    const zip = new AdmZip();
    const items = fs.readdirSync(repoDir, { withFileTypes: true });
    items.forEach(item => {
      const itemPath = path.join(repoDir, item.name);
      if (item.name === 'versions') return; // 排除历史版本目录
      if (item.isDirectory()) {
        zip.addLocalFolder(itemPath, item.name);
      } else {
        zip.addLocalFile(itemPath, '', item.name);
      }
    });

    const zipName = `${prototype.name || prototype.id}.zip`;
    const zipBuffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 创建原型（所有已登录用户均可创建自己的原型）
router.post('/', requireAuth, (req, res) => {
  const { name, description, categoryId, tags } = req.body;
  
  if (!name) {
    return res.status(400).json({ success: false, message: '名称不能为空' });
  }
  
  const id = generateId();
  const prototype = createPrototype({
    id, name, description, categoryId,
    createdBy: req.user.id
  });
  
  if (tags && tags.length > 0) {
    setPrototypeTags(id, tags);
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
  if (!canEditPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  if (!req.file) {
    return res.status(400).json({ success: false, message: '没有上传文件' });
  }
  
  if (!req.body.versionNote || !req.body.versionNote.trim()) {
    return res.status(400).json({ success: false, message: '版本描述不能为空' });
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
          note: req.body.versionNote.trim(),
          versionType: req.body.versionType
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
  if (!canEditPrototype(req, prototype)) {
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
  if (!canEditPrototype(req, prototype)) {
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

// 更新版本描述
router.put('/:id/versions/:versionId/note', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (!canEditPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }

  const versionId = parseInt(req.params.versionId, 10);
  const allVersions = getVersions(req.params.id);
  const found = allVersions.find(v => v.id === versionId);
  if (!found) {
    return res.status(404).json({ success: false, message: '版本不存在' });
  }

  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ success: false, message: '版本描述不能为空' });
  }

  const updated = updateVersionNote(found.id, note.trim());
  res.json({ success: true, data: updated });
});

// 获取原型分享列表
router.get('/:id/shares', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  const admin = isAdmin(req);
  const isCreator = prototype.created_by === req.user.id;
  if (!admin && !isCreator) {
    return res.status(403).json({ success: false, message: '无权查看分享信息' });
  }
  const shares = getPrototypeShares(prototype.id);
  res.json({ success: true, data: shares });
});

// 分享原型给指定用户或用户组（支持 username、userId 或 groupId）
router.post('/:id/shares', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (!canEditPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }

  const { userId, username, groupId } = req.body;

  // 按用户组分享：把组内成员批量加入 prototype_shares
  if (groupId) {
    const { getGroupById } = require('../services/db-groups');
    const group = getGroupById(parseInt(groupId, 10));
    if (!group) {
      return res.status(404).json({ success: false, message: '用户组不存在' });
    }
    if (!group.member_ids || group.member_ids.length === 0) {
      return res.status(400).json({ success: false, message: '该用户组没有成员' });
    }
    group.member_ids.forEach(memberId => {
      if (memberId !== req.user.id) {
        addPrototypeShare(prototype.id, memberId);
      }
    });
    const shares = getPrototypeShares(prototype.id);
    return res.json({ success: true, data: shares });
  }

  if (!userId && !username) {
    return res.status(400).json({ success: false, message: '请提供用户ID、用户名或用户组ID' });
  }

  const { findUserById, findUserByUsername } = require('../services/db-users');
  const targetUser = userId ? findUserById(userId) : findUserByUsername(username);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  if (targetUser.id === req.user.id) {
    return res.status(400).json({ success: false, message: '不能分享给自己' });
  }

  const shares = addPrototypeShare(prototype.id, targetUser.id);
  res.json({ success: true, data: shares });
});

// 取消分享
router.delete('/:id/shares/:userId', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (!canEditPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }

  const targetUserId = parseInt(req.params.userId, 10);
  const shares = removePrototypeShare(prototype.id, targetUserId);
  res.json({ success: true, data: shares });
});

// 更新原型信息
router.put('/:id', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  if (!canEditPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  const { name, description, categoryId } = req.body;
  const updated = updatePrototype(prototype.id, { name, description, categoryId });
  
  res.json({ success: true, data: updated });
});


// 删除原型（软删除）
router.delete('/:id', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  
  if (!canEditPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权操作该原型' });
  }
  
  softDeletePrototype(prototype.id);
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

// ========== 系统管理 API ==========

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

// 更新分类（仅admin）
router.put('/categories/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const categoryId = parseInt(req.params.id, 10);
  const category = getCategoryById(categoryId);
  if (!category) {
    return res.status(404).json({ success: false, message: '分类不存在' });
  }
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '名称不能为空' });
  }
  try {
    const updated = updateCategory(categoryId, { name: name.trim(), description });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, message: '分类名称已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除分类（仅admin）
router.delete('/categories/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const categoryId = parseInt(req.params.id, 10);
  const category = getCategoryById(categoryId);
  if (!category) {
    return res.status(404).json({ success: false, message: '分类不存在' });
  }
  deleteCategory(categoryId);
  res.json({ success: true, message: '删除成功' });
});

// 转移原型归属者（仅admin）
router.put('/:id/transfer', requireAuth, requireRole(['admin']), (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  const { new_owner_id } = req.body;
  if (!new_owner_id) {
    return res.status(400).json({ success: false, message: '请指定新的归属者' });
  }
  const { findUserById } = require('../services/db-users');
  const newOwner = findUserById(new_owner_id);
  if (!newOwner) {
    return res.status(404).json({ success: false, message: '目标用户不存在' });
  }
  const updated = transferPrototype(prototype.id, new_owner_id);
  res.json({ success: true, data: updated });
});

// ========== 评论反馈 ==========

// 获取评论列表
router.get('/:id/comments', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  const comments = getComments(req.params.id);
  res.json({ success: true, data: comments });
});

// 发表评论
router.post('/:id/comments', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  const { content, images, parentId } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ success: false, message: '评论内容不能为空' });
  }
  try {
    const comment = createComment({
      prototypeId: req.params.id,
      userId: req.user.id,
      content: content.trim(),
      images: images || '[]',
      parentId
    });
    res.json({ success: true, data: comment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除评论
router.delete('/:id/comments/:commentId', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  const commentId = parseInt(req.params.commentId, 10);
  const comment = getComments(req.params.id).find(c => c.id === commentId);
  if (!comment) {
    return res.status(404).json({ success: false, message: '评论不存在' });
  }
  if (!isAdmin(req) && comment.user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权删除该评论' });
  }
  deleteComment(commentId);
  res.json({ success: true });
});

// 上传评论图片
router.post('/:id/comments/images', requireAuth, commentImageUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '没有上传图片' });
  }
  const filename = req.file.filename;
  res.json({
    success: true,
    data: {
      filename,
      originalName: req.file.originalname,
      url: `/api/prototypes/${req.params.id}/comments/images/${filename}`
    }
  });
});

// 获取评论图片
router.get('/:id/comments/images/:filename', (req, res) => {
  const filePath = path.join(COMMENT_IMAGES_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: '图片不存在' });
  }
  res.sendFile(filePath);
});

// ========== 访问统计 ==========

// 获取访问统计
router.get('/:id/stats', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (!canAccessPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权访问该原型' });
  }
  const stats = getVisitStats(req.params.id);
  res.json({ success: true, data: stats });
});

// 记录访问
router.post('/:id/visit', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  if (!canAccessPrototype(req, prototype)) {
    return res.status(403).json({ success: false, message: '无权访问该原型' });
  }
  recordVisit({
    prototypeId: req.params.id,
    visitorIp: req.ip,
    userId: req.user.id
  });
  res.json({ success: true });
});

module.exports = { router, migrateFromJson };
