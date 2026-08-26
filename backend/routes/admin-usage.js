const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getUsageStats } = require('../services/db-usage-stats');
const { recordUsageEvent, normalizeSource } = require('../services/usage-events');

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

module.exports = router;
