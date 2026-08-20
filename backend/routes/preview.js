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
const router = express.Router();

// 检查当前登录用户是否有权访问原型
function canAccessPrototype(prototype, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (prototype.created_by === user.id) return true;
  return getSharedUserIds(prototype.id).includes(user.id);
}

function previewSmokeScript() {
  return `<script data-fuxi-preview-smoke>
(function () {
  if (window.parent === window) return;
  var startedAt = Date.now();
  var finalStatus = null;
  function clean(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 500);
  }
  function report(status, errors, warnings) {
    if (finalStatus) return;
    finalStatus = status;
    window.parent.postMessage({
      source: 'fuxi-preview-smoke',
      status: status,
      errors: (errors || []).map(clean).filter(Boolean).slice(0, 20),
      warnings: (warnings || []).map(clean).filter(Boolean).slice(0, 20),
      durationMs: Date.now() - startedAt
    }, window.location.origin);
  }
  window.addEventListener('error', function (event) {
    var target = event && event.target;
    if (target && target !== window) {
      var resource = target.src || target.href || target.tagName || '资源';
      report('failed', ['资源加载失败：' + resource], []);
      return;
    }
    var message = event && event.error && event.error.message
      ? event.error.message
      : (event && event.message) || '页面运行时错误';
    report('failed', ['页面运行时错误：' + message], []);
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var message = reason && reason.message ? reason.message : reason;
    report('failed', ['未处理的异步错误：' + (message || '未知错误')], []);
  });
  window.addEventListener('load', function () {
    window.setTimeout(function () {
      var app = document.querySelector('#app');
      var root = app || document.body;
      var hasContent = app
        ? Boolean(app.children.length || (app.textContent || '').trim() || (app.innerHTML || '').trim().length > 20)
        : Array.prototype.some.call(document.body.children, function (element) {
          return !/^(SCRIPT|STYLE|LINK|META|NOSCRIPT)$/i.test(element.tagName)
            && Boolean(element.offsetWidth || element.offsetHeight || (element.textContent || '').trim());
        });
      if (!hasContent) {
        report('failed', ['预览加载后页面为空'], []);
      } else {
        report('passed', [], []);
      }
    }, 1200);
  }, { once: true });
}());
</script>`;
}

// 通用的HTML处理函数：注入<base>标签并将绝对路径转为相对路径
function processHtml(content, basePath, { smoke = false } = {}) {
  // 将本地绝对路径转为相对路径，使<base>标签生效
  // 不碰 // 或 http:// https://
  content = content.replace(/(src|href|content)=(["'])\/([^\/][^"']*)\2/g, '$1=$2$3$2');

  // 注入 <base> 标签到 <head> 中
  if (content.includes('<head>')) {
    content = content.replace('<head>', `<head>\n  <base href="${basePath}">`);
  } else if (content.includes('<HEAD>')) {
    content = content.replace('<HEAD>', `<HEAD>\n  <base href="${basePath}">`);
  }

  if (smoke) {
    const smokeScript = previewSmokeScript();
    if (content.includes('</head>')) {
      content = content.replace('</head>', `${smokeScript}\n</head>`);
    } else if (content.includes('</HEAD>')) {
      content = content.replace('</HEAD>', `${smokeScript}\n</HEAD>`);
    } else {
      content = `${smokeScript}\n${content}`;
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
  content = processHtml(content, `/preview/changes/${encodeURIComponent(change.id)}/${dirPart}`, { smoke: true });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(content);
});

router.use('/changes/:changeId', (req, res, next) => {
  const change = getChangeById(req.params.changeId);
  const candidateDir = candidateDirectory(change);
  if (!candidateDir || !fs.existsSync(candidateDir)) return res.status(404).send('候选不存在');
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
  recordVisit({ prototypeId: prototype.id, visitorIp: req.ip, userId: req.user ? req.user.id : null });

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
  recordVisit({ prototypeId: prototype.id, visitorIp: req.ip, userId: req.user ? req.user.id : null });

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
