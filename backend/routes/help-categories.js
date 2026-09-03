const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getHelpDocument } = require('../services/db-help-documents');
const {
  HelpCategoryError,
  listHelpCategories,
  createHelpCategory,
  updateHelpCategory,
  archiveHelpCategory,
  restoreHelpCategory,
  setDocumentCategories
} = require('../services/db-help-categories');

const router = express.Router();
const adminOnly = [requireAuth, requireRole(['admin', 'platform_admin'])];

function sendError(res, error, fallback) {
  if (error instanceof HelpCategoryError) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details
    });
  }
  console.error(`[帮助分类] ${fallback}:`, error);
  return res.status(500).json({ success: false, message: fallback });
}

router.get('/', requireAuth, (req, res) => {
  try {
    const includeArchived = (req.user.roles || []).some(role => ['admin', 'platform_admin'].includes(role))
      && String(req.query.includeArchived) === 'true';
    const includeDocuments = includeArchived && String(req.query.includeDocuments) === 'true';
    res.json({ success: true, data: listHelpCategories({ includeArchived, includeDocuments }) });
  } catch (error) {
    sendError(res, error, '加载帮助分类失败');
  }
});

router.post('/', ...adminOnly, (req, res) => {
  try {
    res.status(201).json({ success: true, data: createHelpCategory(req.body || {}, req.user.id) });
  } catch (error) {
    sendError(res, error, '创建帮助分类失败');
  }
});

router.put('/:id', ...adminOnly, (req, res) => {
  try {
    res.json({ success: true, data: updateHelpCategory(req.params.id, req.body || {}) });
  } catch (error) {
    sendError(res, error, '更新帮助分类失败');
  }
});

router.post('/:id/archive', ...adminOnly, (req, res) => {
  try {
    res.json({ success: true, data: archiveHelpCategory(req.params.id) });
  } catch (error) {
    sendError(res, error, '归档帮助分类失败');
  }
});

router.post('/:id/restore', ...adminOnly, (req, res) => {
  try {
    res.json({ success: true, data: restoreHelpCategory(req.params.id) });
  } catch (error) {
    sendError(res, error, '恢复帮助分类失败');
  }
});

router.put('/:id/documents', ...adminOnly, (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    const category = listHelpCategories({ includeArchived: true, includeDocuments: true }).items.find(item => item.id === categoryId);
    if (!category) return res.status(404).json({ success: false, message: '帮助分类不存在' });
    if (category.status !== 'active') return res.status(400).json({ success: false, message: '已归档分类不能分发手册' });
    const slugs = req.body && req.body.documentSlugs;
    if (!Array.isArray(slugs)) return res.status(400).json({ success: false, message: 'documentSlugs 必须是数组' });
    slugs.forEach(slug => {
      if (!getHelpDocument(slug, { includeDrafts: true })) {
        throw new HelpCategoryError('HELP_DOCUMENT_NOT_FOUND', `帮助文档不存在：${slug}`, 404);
      }
    });

    // 先清空该分类，再按文档原有分类集合增删，避免覆盖同一文档的其他分类。
    const currentDocuments = category.documents || [];
    const target = new Set(slugs);
    const current = new Set(currentDocuments.map(document => document.slug));
    current.forEach(slug => {
      if (target.has(slug)) return;
      const document = getHelpDocument(slug, { includeDrafts: true });
      const remaining = document.categories.filter(item => item.id !== categoryId && item.status === 'active').map(item => item.id);
      setDocumentCategories(slug, remaining, req.user.id);
    });
    target.forEach(slug => {
      const document = getHelpDocument(slug, { includeDrafts: true });
      const categoryIds = new Set(document.categories.filter(item => item.status === 'active').map(item => item.id));
      categoryIds.add(categoryId);
      setDocumentCategories(slug, [...categoryIds], req.user.id);
    });
    res.json({ success: true, data: listHelpCategories({ includeArchived: true, includeDocuments: true }).items.find(item => item.id === categoryId) });
  } catch (error) {
    sendError(res, error, '更新帮助分类分发失败');
  }
});

module.exports = router;
