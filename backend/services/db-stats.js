const { run, query, queryOne } = require('../database/db');

function recordVisit({ prototypeId, visitorIp, userId }) {
  const now = new Date().toISOString();
  run(
    `INSERT INTO prototype_visits (prototype_id, visitor_ip, user_id, visited_at) VALUES (?, ?, ?, ?)`,
    [prototypeId, visitorIp || null, userId || null, now]
  );
}

function getVisitCount(prototypeId) {
  const result = queryOne(
    `SELECT COUNT(*) as count FROM prototype_visits WHERE prototype_id = ?`,
    [prototypeId]
  );
  return result ? result.count : 0;
}

function getVisitStats(prototypeId) {
  const total = getVisitCount(prototypeId);

  const now = new Date();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const recent7 = queryOne(
    `SELECT COUNT(*) as count FROM prototype_visits WHERE prototype_id = ? AND visited_at > ?`,
    [prototypeId, sevenDaysAgo]
  );

  const recent30 = queryOne(
    `SELECT COUNT(*) as count FROM prototype_visits WHERE prototype_id = ? AND visited_at > ?`,
    [prototypeId, thirtyDaysAgo]
  );

  return {
    total,
    recent7: recent7 ? recent7.count : 0,
    recent30: recent30 ? recent30.count : 0
  };
}

function getAllVisitCounts() {
  const results = query(`
    SELECT prototype_id, COUNT(*) as count
    FROM prototype_visits
    GROUP BY prototype_id
  `);
  const map = {};
  results.forEach(r => {
    map[r.prototype_id] = r.count;
  });
  return map;
}

module.exports = {
  recordVisit,
  getVisitCount,
  getVisitStats,
  getAllVisitCounts
};
