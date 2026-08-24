const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { UPLOADS_DIR } = require('../services/storage');
const {
  PrototypeDirectChangeError,
  PrototypeDirectChangeService,
  getDirectChangeById,
  getCurrentChange
} = require('../services/prototype-direct-changes');

const router = express.Router();
const candidateUpload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype === 'application/zip' || file.originalname.toLowerCase().endsWith('.zip')) callback(null, true);
    else callback(new PrototypeDirectChangeError('CANDIDATE_INVALID', '候选只支持 ZIP 文件'));
  }
});

function sendError(res, error) {
  if (error && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, code: 'CANDIDATE_TOO_LARGE', message: '候选 ZIP 不能超过 100 MB' });
  }
  if (error instanceof PrototypeDirectChangeError) {
    return res.status(error.status || 400).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details || undefined
    });
  }
  return res.status(500).json({ success: false, code: 'DIRECT_CHANGE_FAILED', message: '独立原型修改失败' });
}

const service = () => new PrototypeDirectChangeService();

// MCP 只拿任务码兑换，兑换后才可读取源码并上传候选。
router.post('/direct-changes/handoffs/redeem', requireAuth, (req, res) => {
  try {
    res.json({ success: true, data: service().redeemHandoff({ actor: req.user, handoffCode: req.body.handoffCode }) });
  } catch (error) { sendError(res, error); }
});

router.get('/:prototypeId/direct-changes/current', requireAuth, (req, res) => {
  try {
    const current = getCurrentChange(req.params.prototypeId, req.user);
    res.json({ success: true, data: current });
  } catch (error) { sendError(res, error); }
});

router.post('/:prototypeId/direct-changes', requireAuth, (req, res) => {
  try {
    const result = service().createChange({
      actor: req.user,
      prototypeId: req.params.prototypeId,
      requirement: req.body.requirement,
      versionStrategy: req.body.versionStrategy || { type: req.body.versionStrategyType, value: req.body.versionStrategyValue }
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) { sendError(res, error); }
});

router.get('/:prototypeId/direct-changes/:changeId', requireAuth, (req, res) => {
  try {
    const change = service().getChangeForActor(req.user, req.params.changeId);
    if (change.prototype_id !== req.params.prototypeId) return res.status(404).json({ success: false, message: '修改任务不存在' });
    res.json({ success: true, data: change });
  } catch (error) { sendError(res, error); }
});

router.patch('/:prototypeId/direct-changes/:changeId', requireAuth, (req, res) => {
  try {
    const result = service().updateChange({
      actor: req.user,
      changeId: req.params.changeId,
      requirement: req.body.requirement,
      versionStrategy: req.body.versionStrategy || { type: req.body.versionStrategyType, value: req.body.versionStrategyValue }
    });
    if (result.change.prototype_id !== req.params.prototypeId) return res.status(404).json({ success: false, message: '修改任务不存在' });
    res.json({ success: true, data: result });
  } catch (error) { sendError(res, error); }
});

router.delete('/:prototypeId/direct-changes/:changeId', requireAuth, (req, res) => {
  try {
    const change = service().getChangeForActor(req.user, req.params.changeId);
    if (change.prototype_id !== req.params.prototypeId) return res.status(404).json({ success: false, message: '修改任务不存在' });
    res.json({ success: true, data: service().cancelChange({ actor: req.user, changeId: req.params.changeId }) });
  } catch (error) { sendError(res, error); }
});

router.post('/:prototypeId/direct-changes/:changeId/candidate', requireAuth, candidateUpload.single('file'), (req, res) => {
  const uploadedPath = req.file && req.file.path;
  try {
    const current = service().getChangeForActor(req.user, req.params.changeId);
    if (current.prototype_id !== req.params.prototypeId) return res.status(404).json({ success: false, message: '修改任务不存在' });
    const result = service().submitCandidate({
      actor: req.user,
      changeId: req.params.changeId,
      zipPath: uploadedPath,
      versionType: req.body.versionType
    });
    res.json({ success: true, data: result });
  } catch (error) { sendError(res, error); }
  finally { if (uploadedPath && fs.existsSync(uploadedPath)) fs.rmSync(uploadedPath, { force: true }); }
});

router.post('/:prototypeId/direct-changes/:changeId/preview-validation', requireAuth, (req, res) => {
  try {
    const current = service().getChangeForActor(req.user, req.params.changeId);
    if (current.prototype_id !== req.params.prototypeId) return res.status(404).json({ success: false, message: '修改任务不存在' });
    const result = service().recordPreviewValidation({
      actor: req.user,
      changeId: req.params.changeId,
      status: req.body.status,
      errors: req.body.errors,
      warnings: req.body.warnings,
      durationMs: req.body.durationMs
    });
    res.json({ success: true, data: result });
  } catch (error) { sendError(res, error); }
});

module.exports = router;
