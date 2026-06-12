const express = require('express');
const path = require('path');
const fs = require('fs');
const { getPrototypeById, getSharedUserIds } = require('../services/db-prototypes');
const { recordVisit } = require('../services/db-stats');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// 检查当前登录用户是否有权访问原型
function canAccessPrototype(prototype, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (prototype.created_by === user.id) return true;
  return getSharedUserIds(prototype.id).includes(user.id);
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

  return content;
}

// 历史版本预览HTML
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

// 历史版本静态资源
router.use('/:id/versions/:v', requireAuth, (req, res, next) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).send('原型不存在');
  }
  if (!canAccessPrototype(prototype, req.user)) {
    return res.status(403).send('无权访问该原型');
  }
  const versionDir = path.join(__dirname, '../repos', prototype.id, 'versions', req.params.v);
  if (!fs.existsSync(versionDir)) {
    return res.status(404).send('版本不存在');
  }
  express.static(versionDir)(req, res, next);
});

// 当前版本预览HTML
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

// 其他静态文件直接服务（JS/CSS/图片等）
router.use('/:id', requireAuth, (req, res, next) => {
  const prototype = getPrototypeById(req.params.id);
  if (!prototype) {
    return res.status(404).send('原型不存在');
  }
  if (!canAccessPrototype(prototype, req.user)) {
    return res.status(403).send('无权访问该原型');
  }
  express.static(path.join(__dirname, '../repos', prototype.id))(req, res, next);
});

module.exports = router;
