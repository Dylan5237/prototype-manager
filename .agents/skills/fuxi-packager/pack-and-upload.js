/**
 * 伏羲打包上传脚本
 * 用法: node pack-and-upload.js <项目路径> [原型名称] [描述]
 * 示例: node pack-and-upload.js AuthComponent "权限校验原型" "基于Vue3的权限管理组件"
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const os = require('os');
const { execSync } = require('child_process');

const API_BASE = process.env.FUXI_API_URL || 'http://8.145.49.128'; // 线上伏羲平台
const USERNAME = 'admin';
const PASSWORD = 'admin123';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const apiUrl = new URL(options.path, API_BASE);
    const client = apiUrl.protocol === 'https:' ? https : http;
    const req = client.request({
      ...options,
      hostname: apiUrl.hostname,
      port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
      path: apiUrl.pathname + apiUrl.search
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login() {
  const res = await request({
    path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ username: USERNAME, password: PASSWORD }));
  if (!res.success) throw new Error('登录失败: ' + (res.message || '未知错误'));
  return res.data.token;
}

async function updatePrototype(token, id, { name, description }) {
  try {
    const payload = {};
    if (name) payload.name = name;
    if (description) payload.description = description;
    if (Object.keys(payload).length === 0) return;
    const res = await request({
      path: `/api/prototypes/${id}`, method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    }, JSON.stringify(payload));
    if (res.success) {
      console.log(`[INFO] 原型信息已更新`);
    }
  } catch (e) {
    console.log(`[WARN] 更新原型信息失败: ${e.message}`);
  }
}

async function findOrCreatePrototype(token, name, description) {
  const list = await request({
    path: '/api/prototypes', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const prototypes = list.data || [];
  const existing = prototypes.find(p => p.name === name);
  if (existing) {
    console.log(`[INFO] 找到已有原型: ${name} (${existing.id})`);
    if (description && description !== existing.description) {
      await updatePrototype(token, existing.id, { name, description });
    }
    return existing.id;
  }
  const created = await request({
    path: '/api/prototypes', method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  }, JSON.stringify({ name, description: description || '' }));
  console.log(`[INFO] 创建新原型: ${name} (${created.data.id})`);
  return created.data.id;
}

function isProjectGitRoot(projectPath) {
  try {
    const toplevel = execSync('git rev-parse --show-toplevel', { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }).trim();
    return path.resolve(toplevel) === path.resolve(projectPath);
  } catch (e) {
    return false;
  }
}

function summarizeChanges(files) {
  const fileNames = files.map(f => path.basename(f));
  const dirs = files.map(f => {
    const parts = f.split(/[/\\]/).filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
  }).filter(Boolean);
  const uniqueDirs = [...new Set(dirs)];

  const hasCode = files.some(f => ['.js', '.ts', '.vue', '.jsx', '.tsx', '.py', '.java', '.go', '.rs'].some(ext => f.toLowerCase().endsWith(ext)));
  const hasStyle = files.some(f => ['.css', '.scss', '.less', '.sass'].some(ext => f.toLowerCase().endsWith(ext)));
  const hasDoc = files.some(f => ['.md', '.txt'].some(ext => f.toLowerCase().endsWith(ext)));
  const hasAsset = files.some(f => ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.mp4', '.mp3'].some(ext => f.toLowerCase().endsWith(ext)));

  const parts = [];
  if (hasCode) parts.push('代码');
  if (hasStyle) parts.push('样式');
  if (hasDoc) parts.push('文档');
  if (hasAsset) parts.push('资源文件');
  if (parts.length === 0) parts.push('文件');

  let scope = '';
  if (uniqueDirs.length === 1) {
    scope = `【${uniqueDirs[0]}】`;
  } else if (uniqueDirs.length > 1 && uniqueDirs.length <= 3) {
    scope = `【${uniqueDirs.join('/')}】`;
  }

  const mainFiles = fileNames.slice(0, 3).join('、');
  return `${scope}更新${parts.join('、')}：${mainFiles}${fileNames.length > 3 ? ' 等' : ''}`;
}

function generateVersionNote(projectPath) {
  if (!isProjectGitRoot(projectPath)) {
    console.log('[WARN] 项目目录不是 git 仓库根目录，无法基于提交生成版本描述');
    return '自动上传更新';
  }

  try {
    // 优先检测工作区未提交变更（用户修改后未 commit 的场景）
    const status = execSync('git status --short', { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }).trim();
    if (status) {
      const files = status.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean);
      return summarizeChanges(files);
    }
  } catch (e) {
    // ignore
  }

  try {
    // 工作区干净时，使用最近一次 commit message
    const msg = execSync('git log -1 --pretty=format:%s', { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }).trim();
    if (msg && msg !== 'init: 初始提交') return msg;
    // 如果只有 init commit，尝试获取变更文件列表（虽然工作区干净，但可能用户刚初始化）
    const files = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }).trim().split('\n').filter(Boolean);
    if (files.length > 0) return summarizeChanges(files);
  } catch (e) {
    // ignore
  }

  return '自动上传更新';
}

async function uploadZip(token, prototypeId, zipPath, versionNote) {
  const zipData = fs.readFileSync(zipPath);
  const boundary = '----FormBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(zipPath)}"\r\nContent-Type: application/zip\r\n\r\n`),
    zipData,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="versionNote"\r\n\r\n${versionNote}`),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const res = await request({
    path: `/api/prototypes/${prototypeId}/upload`, method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  }, body);

  if (!res.success) throw new Error('上传失败: ' + (res.message || '未知错误'));
  console.log(`[INFO] 上传成功: ${res.data.entry_file || '无入口文件'}`);
  return res.data;
}

async function checkReadme(token, prototypeId) {
  const res = await request({
    path: `/api/prototypes/${prototypeId}/readme`, method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.data && res.data.file_path) {
    console.log(`[INFO] README已提取: ${res.data.file_path} (${res.data.content?.length || 0} 字符)`);
    return true;
  }
  console.log(`[WARN] 未找到README文件`);
  return false;
}

/**
 * Kill dev server processes running on common ports for the project.
 * Checks Vite default (5173), webpack-dev-server (8080), and other common ports.
 */
function killDevServer(projectPath) {
  const absPath = path.resolve(projectPath);
  const ports = [5173, 5174, 3000, 8080, 4173];
  let killed = false;

  for (const port of ports) {
    try {
      const result = execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();

      if (result) {
        const pids = result.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
        for (const pid of pids) {
          try {
            const cmdLine = execSync(
              `powershell -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
              { encoding: 'utf-8', stdio: 'pipe' }
            ).trim().toLowerCase();
            // Only kill if the process is related to the project path
            if (cmdLine.includes(absPath.toLowerCase()) || cmdLine.includes('node') || cmdLine.includes('vite')) {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
              console.log(`[INFO] 已终止进程 PID ${pid} (端口 ${port})`);
              killed = true;
            }
          } catch (e) {
            // Cannot get command line or cannot kill, skip
          }
        }
      }
    } catch (e) {
      // No process on this port, continue
    }
  }

  if (!killed) {
    console.log(`[INFO] 未检测到运行中的开发服务器`);
  }
}

function buildProject(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    if (pkg.scripts && pkg.scripts.build) {
      console.log(`[INFO] 检测到build脚本，开始构建...`);
      execSync('npm run build', { cwd: projectPath, stdio: 'inherit' });
      console.log(`[INFO] 构建完成`);
      return true;
    }
  } catch (e) {
    console.log(`[WARN] 构建失败或无需构建: ${e.message}`);
  }
  return false;
}

function walkDir(dir, baseDir, excludeDirs, fileList) {
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const item of items) {
    if (excludeDirs.includes(item.name)) continue;
    const fullPath = path.join(dir, item.name);
    const relativePath = path.relative(baseDir, fullPath);
    if (item.isDirectory()) {
      walkDir(fullPath, baseDir, excludeDirs, fileList);
    } else {
      fileList.push({ fullPath, relativePath });
    }
  }
}

function packProject(projectPath, outputPath) {
  const absPath = path.resolve(projectPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`项目目录不存在: ${absPath}`);
  }

  // 检查README是否存在
  const readmePaths = ['README.md', 'readme.md', 'docs/README.md', 'docs/readme.md'];
  let hasReadme = false;
  for (const rp of readmePaths) {
    if (fs.existsSync(path.join(absPath, rp))) {
      hasReadme = true;
      console.log(`[INFO] 发现README: ${rp}`);
      break;
    }
  }
  if (!hasReadme) {
    console.log(`[WARN] 未在项目中发现README文件`);
  }

  const excludeDirs = ['node_modules', '.git', '.venv', 'uploads', 'data', 'repos'];
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.tiff', '.tif'];
  // 不再排除 .md 文档，README 等需要被打进 ZIP

  // 递归收集文件
  const fileList = [];
  walkDir(absPath, absPath, excludeDirs, fileList);

  // 判断是否有 dist/ 目录（Vite/Webpack 构建产物）
  const hasDist = fileList.some(f => f.relativePath === 'dist' || f.relativePath.startsWith('dist/') || f.relativePath.startsWith('dist\\'));

  let filteredList;
  if (hasDist) {
    // 有 dist/ 时：打包 dist/ 内容（提升到根目录）+ 根目录的所有 .md 文件
    console.log(`[INFO] 检测到 dist/ 目录，使用构建产物打包，同时保留文档文件`);
    const distFiles = fileList
      .filter(f => f.relativePath.startsWith('dist/') || f.relativePath.startsWith('dist\\'))
      .map(f => ({
        ...f,
        relativePath: f.relativePath.slice(5) // 去掉 'dist/' 前缀
      }));
    const mdFiles = fileList
      .filter(f => {
        const ext = path.extname(f.relativePath).toLowerCase();
        const isRootMd = ext === '.md' && !f.relativePath.includes(path.sep);
        const isDocsMd = f.relativePath.startsWith('docs/') || f.relativePath.startsWith('docs\\');
        return isRootMd || isDocsMd;
      });
    filteredList = [...distFiles, ...mdFiles];
  } else {
    // 没有 dist/ 时：打包全部文件，排除图片，但保留 .md 文档
    filteredList = fileList.filter(f => {
      const ext = path.extname(f.relativePath).toLowerCase();
      const isRootFile = !f.relativePath.includes(path.sep);
      // 根目录的图片文件排除
      if (isRootFile && imageExts.includes(ext)) return false;
      return true; // .md 等文档全部保留
    });
  }

  console.log(`[INFO] 共 ${filteredList.length} 个文件待打包`);

  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  for (const f of filteredList) {
    try {
      zip.addLocalFile(f.fullPath, path.dirname(f.relativePath) === '.' ? '' : path.dirname(f.relativePath));
    } catch (e) {
      // 跳过无法读取的文件
    }
  }
  zip.writeZip(outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`[INFO] 打包完成: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('用法: node pack-and-upload.js <项目路径> [原型名称] [描述] [版本更新说明]');
    console.log('示例: node pack-and-upload.js AuthComponent "权限校验原型" "基于Vue3的权限管理" "修复登录页样式，优化表单校验"');
    process.exit(1);
  }

  const projectPath = args[0];
  const prototypeName = args[1] || path.basename(path.resolve(projectPath));
  const description = args[2] || '';
  const providedVersionNote = args[3] || '';
  const zipName = `fuxi-upload-${Date.now()}.zip`;
  const zipPath = path.join(os.tmpdir(), zipName);

  console.log(`\n========== 伏羲打包上传 ==========`);
  console.log(`项目路径: ${projectPath}`);
  console.log(`原型名称: ${prototypeName}`);
  console.log(`描述: ${description || '(无)'}`);
  console.log(`版本更新说明: ${providedVersionNote || '(自动生成)'}`);
  console.log(`==================================\n`);

  // 1. 终止开发服务器
  console.log('[STEP 1/5] 检查并终止开发服务器...');
  killDevServer(projectPath);

  // 2. 构建（如有需要）
  console.log('[STEP 2/5] 构建项目...');
  buildProject(projectPath);

  // 3. 打包
  console.log('[STEP 3/5] 打包项目...');
  packProject(projectPath, zipPath);

  // 4. 登录
  console.log('[STEP 4/5] 登录伏羲平台...');
  const token = await login();
  console.log('[INFO] 登录成功');

  // 5. 创建/查找原型
  const prototypeId = await findOrCreatePrototype(token, prototypeName, description);

  // 6. 生成版本描述：优先使用调用方提供的业务性描述，否则基于 git 自动生成
  const versionNote = providedVersionNote.trim() || generateVersionNote(path.resolve(projectPath));
  console.log(`[INFO] 版本描述: ${versionNote}`);

  // 7. 上传
  console.log('[STEP 5/5] 上传ZIP...');
  await uploadZip(token, prototypeId, zipPath, versionNote);

  // 6. 验证README
  await checkReadme(token, prototypeId);

  // 7. 清理
  fs.unlinkSync(zipPath);

  console.log(`\n========== 完成 ==========`);
  console.log(`原型ID: ${prototypeId}`);
  console.log(`管理地址: ${API_BASE}/prototype/${prototypeId}`);
  console.log(`==========================\n`);
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
