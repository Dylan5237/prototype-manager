const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const { ensureRepoDir, removeRepoDir } = require('./storage');
const { detectProxy, setupEnvProxy, checkUrlAccessibleViaProxy } = require('./proxy');

// Git同步配置
const GIT_TIMEOUT = 120000; // 2分钟

// 可选的GitHub镜像（按优先级排序）
const GITHUB_MIRRORS = [
  { name: '官方', url: 'https://github.com' },
  { name: 'ghfast', url: 'https://ghfast.top/https://github.com' },
  { name: 'ghproxy', url: 'https://ghproxy.com/https://github.com' },
];

let globalProxyUrl = null;

/**
 * 初始化代理（在应用启动时调用一次）
 */
async function initProxy() {
  globalProxyUrl = await detectProxy();
  if (globalProxyUrl) {
    setupEnvProxy(globalProxyUrl);
  } else {
    console.log('[代理] 未检测到代理，将尝试直连GitHub');
    console.log('[代理] 如需手动指定代理，请设置环境变量 HTTPS_PROXY=http://127.0.0.1:7890');
  }
  return globalProxyUrl;
}

function getProxyUrl() {
  return globalProxyUrl;
}

/**
 * 检测GitHub网络连通性
 * 返回可访问的镜像URL，如果都不可访问则返回null
 */
async function detectGitHubMirror(repoUrl) {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return null;

  const { owner, repo } = parsed;

  for (const mirror of GITHUB_MIRRORS) {
    const testUrl = `${mirror.url}/${owner}/${repo}.git`;
    let isAccessible;
    if (globalProxyUrl) {
      isAccessible = await checkUrlAccessibleViaProxy(testUrl, globalProxyUrl, 10000);
    } else {
      isAccessible = await checkUrlAccessible(testUrl);
    }
    if (isAccessible) {
      console.log(`[GitHub同步] 使用镜像: ${mirror.name}`);
      return testUrl;
    }
  }

  return null;
}

function checkUrlAccessible(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? require('https') : require('http');
    const req = client.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * 获取 git 代理配置参数
 */
function getGitProxyConfig() {
  if (!globalProxyUrl) return [];
  return [
    '--config', `http.proxy=${globalProxyUrl}`,
    '--config', `https.proxy=${globalProxyUrl}`,
    '--config', 'http.sslVerify=false'
  ];
}

/**
 * 从GitHub同步代码
 * @param {string} prototypeId - 原型ID
 * @param {string} repoUrl - GitHub仓库URL
 */
async function syncFromGitHub(prototypeId, repoUrl) {
  const repoDir = ensureRepoDir(prototypeId);

  try {
    // 检测网络并选择可用镜像
    const effectiveUrl = await detectGitHubMirror(repoUrl);
    if (!effectiveUrl) {
      return {
        success: false,
        error: '无法连接到GitHub，请检查网络或配置代理。尝试访问以下地址均失败: ' +
               GITHUB_MIRRORS.map(m => m.url).join(', ') +
               (globalProxyUrl ? ` (已通过代理 ${globalProxyUrl} 尝试)` : ' (未检测到代理，可设置环境变量 HTTPS_PROXY=http://127.0.0.1:7890)')
      };
    }

    // 关键修复：直接检查当前目录下是否有 .git 文件夹
    const isRepo = fs.existsSync(path.join(repoDir, '.git'));

    if (!isRepo) {
      // 首次克隆
      console.log(`[GitHub同步] 首次克隆: ${effectiveUrl} -> ${repoDir}`);

      removeRepoDir(prototypeId);
      ensureRepoDir(prototypeId);

      const proxyConfig = getGitProxyConfig();
      await simpleGit({ baseDir: process.cwd(), timeout: { block: GIT_TIMEOUT } })
        .clone(effectiveUrl, repoDir, ['--depth', '1', '--single-branch', '--no-tags', ...proxyConfig]);
      console.log(`[GitHub同步] 克隆完成: ${prototypeId}`);
    } else {
      // 拉取最新
      console.log(`[GitHub同步] 拉取更新: ${prototypeId}`);
      const git = simpleGit(repoDir, { timeout: { block: GIT_TIMEOUT } });

      // 获取当前分支名
      const status = await git.status();
      const currentBranch = status.current || 'main';

      // 检查远程URL是否匹配（用户可能修改了GitHub链接）
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      if (origin && origin.refs && origin.refs.fetch !== effectiveUrl) {
        console.log(`[GitHub同步] 更新远程URL: ${origin.refs.fetch} -> ${effectiveUrl}`);
        await git.remote(['set-url', 'origin', effectiveUrl]);
      }

      // 设置本地代理配置
      if (globalProxyUrl) {
        await git.addConfig('http.proxy', globalProxyUrl, false, 'local');
        await git.addConfig('https.proxy', globalProxyUrl, false, 'local');
      }

      await git.fetch('origin', currentBranch, ['--depth', '1']);
      await git.pull('origin', currentBranch);
      console.log(`[GitHub同步] 拉取完成: ${prototypeId} (分支: ${currentBranch})`);
    }

    return { success: true };
  } catch (error) {
    console.error(`[GitHub同步] 失败: ${prototypeId}`, error.message);

    let friendlyError = error.message;
    if (error.message.includes('block timeout')) {
      friendlyError = '连接GitHub超时，请检查网络或尝试配置代理';
    } else if (error.message.includes('Could not resolve host')) {
      friendlyError = '无法解析GitHub域名，请检查DNS设置';
    } else if (error.message.includes('Authentication failed')) {
      friendlyError = 'GitHub认证失败，如果是私有仓库请确保有访问权限';
    } else if (error.message.includes('not found')) {
      friendlyError = '仓库不存在或没有访问权限';
    } else if (error.message.includes('Failed to connect')) {
      friendlyError = '连接GitHub失败，请检查网络或代理设置';
    }

    return { success: false, error: friendlyError };
  }
}

function parseGitHubUrl(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

module.exports = {
  syncFromGitHub,
  parseGitHubUrl,
  detectGitHubMirror,
  initProxy,
  getProxyUrl
};
