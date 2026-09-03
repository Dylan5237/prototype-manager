const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  PromptTemplateError,
  listPromptTemplates,
  updatePromptTemplate,
  resetPromptTemplate,
  renderPromptTemplate,
  previewPromptTemplate
} = require('../services/db-prompt-templates');

const router = express.Router();
const adminOnly = [requireAuth, requireRole(['admin'])];

function sendError(res, error, fallback) {
  if (error instanceof PromptTemplateError) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details
    });
  }
  console.error(`[提示词模板] ${fallback}:`, error);
  return res.status(500).json({ success: false, message: fallback });
}

router.get('/', ...adminOnly, (req, res) => {
  res.json({ success: true, data: listPromptTemplates() });
});

// 必须放在 /:key 之前，避免把 render 识别成模板 key。
router.post('/render', requireAuth, (req, res) => {
  try {
    const { key, variables } = req.body || {};
    const prompt = renderPromptTemplate(key, variables || {});
    res.json({ success: true, data: { key, prompt } });
  } catch (error) {
    sendError(res, error, '渲染提示词失败');
  }
});

router.put('/:key', ...adminOnly, (req, res) => {
  try {
    const template = req.body && req.body.template;
    const data = updatePromptTemplate(req.params.key, {
      template,
      mockData: req.body && req.body.mockData
    }, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error, '更新提示词模板失败');
  }
});

router.post('/:key/preview', ...adminOnly, (req, res) => {
  try {
    const template = req.body && req.body.template;
    const mockData = req.body && req.body.mockData;
    const prompt = previewPromptTemplate(
      req.params.key,
      template == null ? undefined : template,
      mockData === undefined ? undefined : mockData
    );
    res.json({ success: true, data: { key: req.params.key, prompt } });
  } catch (error) {
    sendError(res, error, '预览提示词失败');
  }
});

router.post('/:key/reset', ...adminOnly, (req, res) => {
  try {
    const data = resetPromptTemplate(req.params.key, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error, '恢复默认模板失败');
  }
});

module.exports = router;
