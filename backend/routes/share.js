const express = require('express');
const router = express.Router();
const { getShareLinkByCode } = require('../services/db-prototypes');
const { findUserByUsername, initGuestUser } = require('../services/db-users');
const { generateShareToken, serializeCookie } = require('../middleware/auth');

const PREVIEW_COOKIE_NAME = 'fuxi_token';

// 访问 /api/s/:code → 用默认访客账号生成 token → 种 Cookie → 302 重定向到预览页
// 这样免登录链接短小（不含 token），且 Cookie 在 /preview 路径下自动生效
router.get('/:code', (req, res) => {
  const record = getShareLinkByCode(req.params.code);
  if (!record) {
    return res.status(404).send('分享链接不存在或已失效');
  }

  initGuestUser();
  const guest = findUserByUsername('user');
  if (!guest) {
    return res.status(500).send('系统未配置默认访客账号');
  }

  const token = generateShareToken(guest);
  const maxAge = 365 * 24 * 60 * 60; // 与 generateShareToken 的 365d 保持一致
  res.setHeader(
    'Set-Cookie',
    serializeCookie(PREVIEW_COOKIE_NAME, token, {
      Path: '/preview',
      HttpOnly: true,
      SameSite: 'Lax',
      MaxAge: maxAge
    })
  );

  // 重定向到预览入口（无需 token 参数，Cookie 会自动带上）
  const target = `/preview/${record.prototype_id}/${record.entry_file}`;
  res.redirect(302, target);
});

module.exports = router;
