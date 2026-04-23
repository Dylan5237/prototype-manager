const simpleGit = require('simple-git');
const path = require('path');
const { ensureRepoDir, removeRepoDir } = require('./storage');

async function syncFromGitHub(prototypeId, repoUrl) {
  const repoDir = ensureRepoDir(prototypeId);
  const git = simpleGit(repoDir);
  
  try {
    // 检查是否已经是git仓库
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      // 首次克隆
      // 先清空目录
      removeRepoDir(prototypeId);
      ensureRepoDir(prototypeId);
      
      await simpleGit().clone(repoUrl, repoDir, ['--depth', '1']);
    } else {
      // 拉取最新
      await git.pull('origin', 'main').catch(() => git.pull('origin', 'master'));
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function parseGitHubUrl(url) {
  // 支持 https://github.com/owner/repo 格式
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }
  return null;
}

module.exports = {
  syncFromGitHub,
  parseGitHubUrl
};
