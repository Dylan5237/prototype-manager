const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getUsageStats } = require('../services/db-usage-stats');

const router = express.Router();

router.get('/usage-stats', requireAuth, requireRole(['admin']), (req, res) => {
  try {
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
