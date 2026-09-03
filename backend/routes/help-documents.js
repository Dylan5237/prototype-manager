const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  HelpDocumentError,
  listHelpDocuments,
  getHelpDocument,
  updateHelpDocument,
  publishHelpDocument,
  archiveHelpDocument,
  previewHelpDocument
} = require('../services/db-help-documents');

const router = express.Router();

function isAdmin(req) {
  return (req.user?.roles || []).includes('admin') || (req.user?.roles || []).includes('platform_admin');
}

function sendError(res, error, fallback) {
  if (error instanceof HelpDocumentError) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details
    });
  }
  console.error(`[帮助中心] ${fallback}:`, error);
  return res.status(500).json({ success: false, message: fallback });
}

router.get('/', requireAuth, (req, res) => {
  try {
    const includeDrafts = isAdmin(req) && String(req.query.includeDrafts) === 'true';
    res.json({
      success: true,
      data: listHelpDocuments({ includeDrafts, queryText: req.query.q })
    });
  } catch (error) {
    sendError(res, error, '加载帮助文档失败');
  }
});

router.get('/:slug', requireAuth, (req, res) => {
  try {
    const document = getHelpDocument(req.params.slug, { includeDrafts: isAdmin(req) });
    if (!document) return res.status(404).json({ success: false, message: '帮助文档不存在或尚未发布' });
    res.json({ success: true, data: document });
  } catch (error) {
    sendError(res, error, '加载帮助文档失败');
  }
});

router.post('/:slug/preview', requireAuth, requireRole(['admin', 'platform_admin']), (req, res) => {
  try {
    res.json({ success: true, data: previewHelpDocument(req.params.slug, req.body || {}) });
  } catch (error) {
    sendError(res, error, '预览帮助文档失败');
  }
});

router.put('/:slug', requireAuth, requireRole(['admin', 'platform_admin']), (req, res) => {
  try {
    res.json({ success: true, data: updateHelpDocument(req.params.slug, req.body || {}, req.user.id) });
  } catch (error) {
    sendError(res, error, '保存帮助文档失败');
  }
});

router.post('/:slug/publish', requireAuth, requireRole(['admin', 'platform_admin']), (req, res) => {
  try {
    res.json({ success: true, data: publishHelpDocument(req.params.slug, req.user.id) });
  } catch (error) {
    sendError(res, error, '发布帮助文档失败');
  }
});

router.post('/:slug/archive', requireAuth, requireRole(['admin', 'platform_admin']), (req, res) => {
  try {
    res.json({ success: true, data: archiveHelpDocument(req.params.slug, req.user.id) });
  } catch (error) {
    sendError(res, error, '归档帮助文档失败');
  }
});

module.exports = router;
