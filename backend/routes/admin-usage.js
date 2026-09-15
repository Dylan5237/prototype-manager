const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getUsageStats } = require('../services/db-usage-stats');
const { recordUsageEvent, normalizeSource } = require('../services/usage-events');
const { getUsageEffectivenessAnalysis } = require('../services/usage-tasks');
const {
  getEfficiencyAnalysis,
  createEfficiencyComparison,
  updateEfficiencyComparison,
  getComparisonAudits
} = require('../services/efficiency-comparisons');
const {
  getAccuracyAnalysis,
  createAccuracyReview,
  updateAccuracyReview,
  getAccuracyReviewAudits
} = require('../services/accuracy-reviews');

const router = express.Router();

router.get('/usage-stats', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    recordUsageEvent({
      eventType: 'admin_usage_viewed',
      userId: req.user.id,
      source: normalizeSource(req.get('x-fuxi-source')),
      resourceType: 'admin_dashboard',
      resourceId: 'usage'
    });
    const data = getUsageStats({
      from: req.query.from,
      to: req.query.to,
      role: req.query.role,
      groupId: req.query.groupId,
      source: req.query.source,
      includeGuest: req.query.includeGuest === 'true'
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, code: 'USAGE_STATS_INVALID', message: error.message });
  }
});

router.get('/usage-effectiveness', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const data = getUsageEffectivenessAnalysis({
      from: req.query.from,
      to: req.query.to,
      taskKind: req.query.taskKind,
      source: req.query.source,
      recentLimit: req.query.recentLimit
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, code: 'USAGE_EFFECTIVENESS_INVALID', message: error.message });
  }
});

router.get('/usage-efficiency', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const data = getEfficiencyAnalysis({
      from: req.query.from,
      to: req.query.to,
      measurementScope: req.query.measurementScope,
      recentLimit: req.query.recentLimit
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, code: error.code || 'EFFICIENCY_ANALYSIS_INVALID', message: error.message });
  }
});

router.post('/usage-efficiency/comparisons', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const data = createEfficiencyComparison(req.body, { actorUserId: req.user.id });
    res.status(201).json({ success: true, data });
  } catch (error) {
    const status = error.code === 'USAGE_TASK_NOT_FOUND' ? 404 : error.code === 'USAGE_TASK_NOT_EFFECTIVE' ? 409 : 400;
    res.status(status).json({ success: false, code: error.code || 'EFFICIENCY_COMPARISON_INVALID', message: error.message });
  }
});

router.put('/usage-efficiency/comparisons/:id', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const data = updateEfficiencyComparison(req.params.id, req.body, { actorUserId: req.user.id });
    res.json({ success: true, data });
  } catch (error) {
    const status = error.code === 'EFFICIENCY_COMPARISON_NOT_FOUND' ? 404 : error.code === 'USAGE_TASK_NOT_EFFECTIVE' ? 409 : 400;
    res.status(status).json({ success: false, code: error.code || 'EFFICIENCY_COMPARISON_INVALID', message: error.message });
  }
});

router.get('/usage-efficiency/comparisons/:id/audits', requireAuth, requireRole(['admin']), (req, res) => {
  res.json({ success: true, data: getComparisonAudits(req.params.id) });
});

router.get('/usage-accuracy', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const data = getAccuracyAnalysis({
      from: req.query.from, to: req.query.to,
      measurementScope: req.query.measurementScope, recentLimit: req.query.recentLimit
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, code: error.code || 'ACCURACY_ANALYSIS_INVALID', message: error.message });
  }
});

router.post('/usage-accuracy/reviews', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    res.status(201).json({ success: true, data: createAccuracyReview(req.body, { actorUserId: req.user.id }) });
  } catch (error) {
    const status = error.code === 'USAGE_TASK_NOT_FOUND' ? 404 : error.code === 'USAGE_TASK_NOT_EFFECTIVE' || error.code === 'ACCURACY_REVIEW_DUPLICATE' ? 409 : 400;
    res.status(status).json({ success: false, code: error.code || 'ACCURACY_REVIEW_INVALID', message: error.message });
  }
});

router.put('/usage-accuracy/reviews/:id', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    res.json({ success: true, data: updateAccuracyReview(req.params.id, req.body, { actorUserId: req.user.id }) });
  } catch (error) {
    const status = error.code === 'ACCURACY_REVIEW_NOT_FOUND' ? 404 : error.code === 'USAGE_TASK_NOT_EFFECTIVE' ? 409 : 400;
    res.status(status).json({ success: false, code: error.code || 'ACCURACY_REVIEW_INVALID', message: error.message });
  }
});

router.get('/usage-accuracy/reviews/:id/audits', requireAuth, requireRole(['admin']), (req, res) => {
  res.json({ success: true, data: getAccuracyReviewAudits(req.params.id) });
});

module.exports = router;
