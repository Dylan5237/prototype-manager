const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/prototypes.json');
const REPOS_DIR = path.join(__dirname, '../repos');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

function loadPrototypes() {
  if (!fs.existsSync(DATA_FILE)) {
    return [];
  }
  const data = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function savePrototypes(prototypes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(prototypes, null, 2), 'utf-8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function getRepoPath(prototypeId) {
  return path.join(REPOS_DIR, prototypeId);
}

function ensureRepoDir(prototypeId) {
  const dir = getRepoPath(prototypeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function removeRepoDir(prototypeId) {
  const dir = getRepoPath(prototypeId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Windows/跨文件系统下目录 rename 可能返回 EPERM/EXDEV；先复制到唯一目标，
// 再尽力清理源目录，避免版本备份阶段因瞬时文件句柄导致整次上传失败。
function moveDirectory(source, target) {
  try {
    fs.renameSync(source, target);
    return { method: 'rename', sourceRemoved: true };
  } catch (error) {
    if (!['EPERM', 'EXDEV', 'EACCES'].includes(error.code)) throw error;
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    try {
      fs.cpSync(source, target, { recursive: true, force: true });
    } catch (copyError) {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      throw copyError;
    }
    let sourceRemoved = true;
    try {
      fs.rmSync(source, { recursive: true, force: true });
    } catch (removeError) {
      // 调用方通常会随后移除整个旧仓库；保留副本比在备份成功后抛错更安全。
      sourceRemoved = false;
    }
    return { method: 'copy', sourceRemoved };
  }
}

function scanFiles(dir, basePath = '') {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    const relativePath = path.join(basePath, item.name).replace(/\\/g, '/');
    if (item.isDirectory()) {
      files.push({
        name: item.name,
        path: relativePath,
        type: 'directory',
        children: scanFiles(path.join(dir, item.name), relativePath)
      });
    } else {
      files.push({
        name: item.name,
        path: relativePath,
        type: 'file',
        size: fs.statSync(path.join(dir, item.name)).size
      });
    }
  }
  return files;
}

function findEntryFile(dir) {
  // 查找入口文件：优先使用构建产物(dist/build)，最后回退到根目录index.html
  const candidates = ['dist/index.html', 'build/index.html', 'index.html', 'public/index.html'];
  for (const candidate of candidates) {
    const fullPath = path.join(dir, candidate);
    if (fs.existsSync(fullPath)) {
      return candidate.replace(/\\/g, '/');
    }
  }
  return null;
}

// 递归复制目录
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const items = fs.readdirSync(src, { withFileTypes: true });
  for (const item of items) {
    if (item.name === 'versions') continue; // 不复制版本目录本身
    const srcPath = path.join(src, item.name);
    const destPath = path.join(dest, item.name);
    if (item.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 计算目录大小（KB）
function getDirSizeKb(dir) {
  let size = 0;
  if (!fs.existsSync(dir)) return 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name === 'versions') continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      size += getDirSizeKb(fullPath);
    } else {
      size += fs.statSync(fullPath).size;
    }
  }
  return Math.round(size / 1024);
}

// 获取版本目录路径
function getVersionPath(prototypeId, versionNumber) {
  return path.join(REPOS_DIR, prototypeId, 'versions', `v${versionNumber}`);
}

// 确保版本目录存在
function ensureVersionDir(prototypeId, versionNumber) {
  const dir = getVersionPath(prototypeId, versionNumber);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// 保存当前版本到历史版本
function saveCurrentVersion(prototypeId, versionNumber) {
  const repoDir = getRepoPath(prototypeId);
  if (!fs.existsSync(repoDir)) return false;
  const items = fs.readdirSync(repoDir, { withFileTypes: true });
  // 如果目录为空或只有versions目录，不保存
  const hasContent = items.some(item => item.name !== 'versions');
  if (!hasContent) return false;
  
  const versionDir = ensureVersionDir(prototypeId, versionNumber);
  for (const item of items) {
    if (item.name === 'versions') continue;
    const srcPath = path.join(repoDir, item.name);
    const destPath = path.join(versionDir, item.name);
    if (item.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

// 回滚版本：将历史版本复制到当前目录
function rollbackVersion(prototypeId, versionNumber) {
  const versionDir = getVersionPath(prototypeId, versionNumber);
  if (!fs.existsSync(versionDir)) return false;
  
  const repoDir = getRepoPath(prototypeId);
  // 清理当前目录（保留versions）
  if (fs.existsSync(repoDir)) {
    const items = fs.readdirSync(repoDir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === 'versions') continue;
      fs.rmSync(path.join(repoDir, item.name), { recursive: true, force: true });
    }
  }
  
  // 复制历史版本内容到当前目录
  const versionItems = fs.readdirSync(versionDir, { withFileTypes: true });
  for (const item of versionItems) {
    const srcPath = path.join(versionDir, item.name);
    const destPath = path.join(repoDir, item.name);
    if (item.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

// 删除历史版本
function removeVersionDir(prototypeId, versionNumber) {
  const versionDir = getVersionPath(prototypeId, versionNumber);
  if (fs.existsSync(versionDir)) {
    fs.rmSync(versionDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

// 清理旧版本：保留最近N个
function cleanupOldVersions(prototypeId, keepCount = 10) {
  const versionsDir = path.join(REPOS_DIR, prototypeId, 'versions');
  if (!fs.existsSync(versionsDir)) return;
  const items = fs.readdirSync(versionsDir, { withFileTypes: true });
  const versionDirs = items
    .filter(item => item.isDirectory() && /^v\d+$/.test(item.name))
    .map(item => ({
      name: item.name,
      num: parseInt(item.name.replace(/^v/, ''), 10)
    }))
    .sort((a, b) => b.num - a.num);
  
  if (versionDirs.length <= keepCount) return;
  const toDelete = versionDirs.slice(keepCount);
  for (const v of toDelete) {
    fs.rmSync(path.join(versionsDir, v.name), { recursive: true, force: true });
  }
}

module.exports = {
  loadPrototypes,
  savePrototypes,
  generateId,
  getRepoPath,
  ensureRepoDir,
  removeRepoDir,
  moveDirectory,
  scanFiles,
  findEntryFile,
  copyDirSync,
  getDirSizeKb,
  getVersionPath,
  ensureVersionDir,
  saveCurrentVersion,
  rollbackVersion,
  removeVersionDir,
  cleanupOldVersions,
  UPLOADS_DIR,
  REPOS_DIR
};
