const express = require('express');
const path = require('path');
const fs = require('fs');
const { getPrototypeById, getSharedUserIds } = require('../services/db-prototypes');
const { recordVisit } = require('../services/db-stats');
const { requireAuth } = require('../middleware/auth');
const { ACTIONS, AuthorizationService } = require('../services/authorization');
const {
  DEFAULT_CANDIDATES_ROOT,
  getChangeById
} = require('../services/lightweight-collaboration');
const {
  DIRECT_CANDIDATES_ROOT,
  getDirectChangeById
} = require('../services/prototype-direct-changes');
const router = express.Router();

// 检查当前登录用户是否有权访问原型
function canAccessPrototype(prototype, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (prototype.created_by === user.id) return true;
  return getSharedUserIds(prototype.id).includes(user.id);
}

function previewRecoveryScript() {
  return `<script data-fuxi-preview-recovery>
(function () {
  var shown = false;
  function show(message) {
    if (shown) return;
    shown = true;
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:50%;transform:translate(-50%,-50%);box-sizing:border-box;width:min(520px,calc(100vw - 40px));padding:24px 26px;border:1px solid #f3c7c7;border-radius:12px;background:#fff7f7;color:#303133;box-shadow:0 12px 32px rgba(0,0,0,.16);font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;';
    box.innerHTML = '<strong style="display:block;margin-bottom:8px;font-size:16px;color:#c45656">原型暂时无法加载</strong>'
      + '<div>' + (message || '页面运行时出现问题') + '</div>'
      + '<div style="margin-top:10px;color:#909399">请返回伏羲平台，在原型详情页点击“让 AI 修改”，让 AI 排查页面加载问题后重新上传。</div>';
    (document.body || document.documentElement).appendChild(box);
  }
  window.addEventListener('error', function (event) {
    var target = event && event.target;
    if (target && target !== window && !/^(SCRIPT|LINK)$/i.test(target.tagName || '')) return;
    var message = event && event.error && event.error.message ? event.error.message : (event && event.message);
    show(message ? '页面运行时出现问题：' + String(message).slice(0, 240) : '页面运行时出现问题');
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    show('页面异步加载失败：' + String(reason && reason.message ? reason.message : (reason || '未知错误')).slice(0, 240));
  });
  window.addEventListener('load', function () {
    window.setTimeout(function () {
      var app = document.querySelector('#app');
      var hasContent = app
        ? Boolean(app.children.length || (app.textContent || '').trim() || (app.innerHTML || '').trim().length > 20)
        : Array.prototype.some.call(document.body.children, function (element) {
          return !/^(SCRIPT|STYLE|LINK|META|NOSCRIPT)$/i.test(element.tagName)
            && Boolean(element.offsetWidth || element.offsetHeight || (element.textContent || '').trim());
        });
      if (!hasContent) show('页面加载后没有显示内容');
    }, 2000);
  }, { once: true });
}());
</script>`;
}

// 通用的HTML处理函数：注入<base>标签并将绝对路径转为相对路径
function processHtml(content, basePath) {
  // 将本地绝对路径转为相对路径，使<base>标签生效
  // 不碰 // 或 http:// https://
  content = content.replace(/(src|href|content)=(["'])\/([^\/][^"']*)\2/g, '$1=$2$3$2');

  // 注入 <base> 标签到 <head> 中
  if (content.includes('<head>')) {
    content = content.replace('<head>', `<head>\n  <base href="${basePath}">`);
  } else if (content.includes('<HEAD>')) {
    content = content.replace('<HEAD>', `<HEAD>\n  <base href="${basePath}">`);
  }

  {
    const recoveryScript = previewRecoveryScript();
    if (content.includes('</head>')) {
      content = content.replace('</head>', `${recoveryScript}\n</head>`);
    } else if (content.includes('</HEAD>')) {
      content = content.replace('</HEAD>', `${recoveryScript}\n</HEAD>`);
    } else {
      content = `${recoveryScript}\n${content}`;
    }
  }

  return content;
}

function candidateDirectory(change) {
  if (!change || !change.candidate_path) return null;
  const candidateRoot = path.resolve(DEFAULT_CANDIDATES_ROOT);
  const candidateDir = path.isAbsolute(change.candidate_path)
    ? path.resolve(change.candidate_path)
    : path.resolve(candidateRoot, change.candidate_path);
  if (!candidateDir.startsWith(`${candidateRoot}${path.sep}`)) return null;
  return candidateDir;
}

function canViewChange(change, user) {
  if (!change || !user) return false;
  return new AuthorizationService().can(user, ACTIONS.VIEW_CHANGE, {
    type: 'change',
    projectId: change.project_id,
    prototypeId: change.prototype_id
  });
}

// 轻协作候选 HTML：入口鉴权，资源沿用高熵 change ID 静态路径。
router.get('/changes/:changeId/*.html', requireAuth, (req, res) => {
  const change = getChangeById(req.params.changeId);
  const candidateDir = candidateDirectory(change);
  if (!change || change.status === 'editing' || !candidateDir) return res.status(404).send('候选不存在');
  if (!canViewChange(change, req.user)) return res.status(403).send('无权查看该候选');

  const filePath = `${req.params[0]}.html`;
  const fullPath = path.resolve(candidateDir, filePath);
  if (!fullPath.startsWith(`${candidateDir}${path.sep}`) || !fs.existsSync(fullPath)) {
    return res.status(404).send('文件不存在');
  }
  let content = fs.readFileSync(fullPath, 'utf-8');
  const fileDir = path.dirname(filePath).replace(/\\/g, '/');
  const dirPart = fileDir && fileDir !== '.' ? `${fileDir}/` : '';
  content = processHtml(content, `/preview/changes/${encodeURIComponent(change.id)}/${dirPart}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(content);
});

router.use('/changes/:changeId', (req, res, next) => {
  const change = getChangeById(req.params.changeId);
  const candidateDir = candidateDirectory(change);
  if (!candidateDir || !fs.existsSync(candidateDir)) return res.status(404).send('候选不存在');
  express.static(candidateDir)(req, res, next);
});

function directCandidateDirectory(change) {
  if (!change || !change.candidate_path) return null;
  const root = path.resolve(DIRECT_CANDIDATES_ROOT);
  const candidateDir = path.isAbsolute(change.candidate_path)
    ? path.resolve(change.candidate_path)
    : path.resolve(root, change.candidate_path);
  if (!candidateDir.startsWith(`${root}${path.sep}`)) return null;
  return candidateDir;
}

function canViewDirectChange(change, user) {
  if (!change || !user) return false;
  const roles = Array.isArray(user.roles) ? user.roles : [user.role];
  return roles.includes('admin') || Number(change.created_by) === Number(user.id);
}

// 独立原型修改候选预览：仅任务创建者/管理员可见，校验通过后保留为正式版本切换证据。
router.get('/direct-changes/:changeId/*.html', requireAuth, (req, res) => {
  const change = getDirectChangeById(req.params.changeId);
  const candidateDir = directCandidateDirectory(change);
  if (!change || change.status === 'editing' || !candidateDir) return res.status(404).send('候选不存在');
  if (!canViewDirectChange(change, req.user)) return res.status(403).send('无权查看该候选');
  const filePath = `${req.params[0]}.html`;
  const fullPath = path.resolve(candidateDir, filePath);
  if (!fullPath.startsWith(`${candidateDir}${path.sep}`) || !fs.existsSync(fullPath)) {
    return res.status(404).send('文件不存在');
  }
  let content = fs.readFileSync(fullPath, 'utf-8');
  const fileDir = path.dirname(filePath).replace(/\\/g, '/');
  const dirPart = fileDir && fileDir !== '.' ? `${fileDir}/` : '';
  content = processHtml(content, `/preview/direct-changes/${encodeURIComponent(change.id)}/${dirPart}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(content);
});

router.use('/direct-changes/:changeId', (req, res, next) => {
  const change = getDirectChangeById(req.params.changeId);
  const candidateDir = directCandidateDirectory(change);
  if (!candidateDir || !fs.existsSync(candidateDir)) return res.status(404).send('候选不存在');
  if (!canViewDirectChange(change, req.user)) return res.status(403).send('无权查看该候选');
  express.static(candidateDir)(req, res, next);
});

// 历史版本预览HTML（需要认证）
router.get('/:id/versions/:v/*.html', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).send('原型不存在');
  }
  if (!canAccessPrototype(prototype, req.user)) {
    return res.status(403).send('无权访问该原型');
  }

  const versionDir = path.join(__dirname, '../repos', prototype.id, 'versions', req.params.v);
  const filePath = req.params[0] + '.html';
  const fullPath = path.join(versionDir, filePath);
  const resolvedPath = path.resolve(fullPath);

  if (!resolvedPath.startsWith(path.resolve(versionDir))) {
    return res.status(403).send('非法路径');
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('文件不存在');
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  const fileDir = path.dirname(filePath).replace(/\\/g, '/');
  const dirPart = fileDir && fileDir !== '.' ? fileDir + '/' : '';
  const basePath = `/preview/${prototype.id}/versions/${req.params.v}/${dirPart}`;
  content = processHtml(content, basePath);

  // 记录访问
  recordVisit({
    prototypeId: prototype.id,
    visitorIp: req.ip,
    userId: req.user ? req.user.id : null,
    source: req.user && req.user.username === 'user' ? 'share' : 'web'
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(content);
});

// 历史版本静态资源（不需要认证，HTML入口已校验权限）
router.use('/:id/versions/:v', (req, res, next) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).send('原型不存在');
  }
  const versionDir = path.join(__dirname, '../repos', prototype.id, 'versions', req.params.v);
  if (!fs.existsSync(versionDir)) {
    return res.status(404).send('版本不存在');
  }
  express.static(versionDir)(req, res, next);
});

// 当前版本预览HTML（需要认证）
router.get('/:id/*.html', requireAuth, (req, res) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).send('原型不存在');
  }
  if (!canAccessPrototype(prototype, req.user)) {
    return res.status(403).send('无权访问该原型');
  }

  const filePath = req.params[0] + '.html';
  const fullPath = path.join(__dirname, '../repos', prototype.id, filePath);
  const repoDir = path.resolve(__dirname, '../repos', prototype.id);
  const resolvedPath = path.resolve(fullPath);

  if (!resolvedPath.startsWith(repoDir)) {
    return res.status(403).send('非法路径');
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('文件不存在');
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  const fileDir = path.dirname(filePath).replace(/\\/g, '/');
  const dirPart = fileDir && fileDir !== '.' ? fileDir + '/' : '';
  const basePath = `/preview/${prototype.id}/${dirPart}`;
  content = processHtml(content, basePath);

  // 记录访问
  recordVisit({
    prototypeId: prototype.id,
    visitorIp: req.ip,
    userId: req.user ? req.user.id : null,
    source: req.user && req.user.username === 'user' ? 'share' : 'web'
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(content);
});

// 其他静态文件直接服务（不需要认证，HTML入口已校验权限）
router.use('/:id', (req, res, next) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).send('原型不存在');
  }
  express.static(path.join(__dirname, '../repos', prototype.id))(req, res, next);
});

module.exports = router;
