const crypto = require('crypto');
const { query, queryOne, run } = require('../database/db');

const VALID_SOURCES = new Set(['web', 'mcp', 'share', 'system']);
const SENSITIVE_KEY = /(token|password|secret|credential|authorization|cookie|ip|raw)/i;

function normalizeSource(source) {
  const value = String(source || 'web').trim().toLowerCase();
  return VALID_SOURCES.has(value) ? value : 'web';
}

function sanitizeMetadata(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).slice(0, 240);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeMetadata(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).slice(0, 30).forEach(key => {
      if (!SENSITIVE_KEY.test(key)) result[key] = sanitizeMetadata(value[key], depth + 1);
    });
    return result;
  }
  return String(value).slice(0, 240);
}

function recordUsageEvent({
  eventType,
  userId = null,
  source = 'web',
  resourceType = null,
  resourceId = null,
  result = 'success',
  eventKey = null,
  occurredAt = new Date().toISOString(),
  metadata = {}
} = {}) {
  if (!eventType) throw new TypeError('eventType 不能为空');
  const id = crypto.randomUUID();
  const safeResult = result === 'failure' ? 'failure' : 'success';
  const safeMetadata = sanitizeMetadata(metadata) || {};
  try {
    run(`
      INSERT OR IGNORE INTO usage_events
        (id, event_key, event_type, user_id, source, resource_type, resource_id,
         result, occurred_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      eventKey || null,
      String(eventType).slice(0, 80),
      userId || null,
      normalizeSource(source),
      resourceType ? String(resourceType).slice(0, 80) : null,
      resourceId === null || resourceId === undefined ? null : String(resourceId).slice(0, 160),
      safeResult,
      occurredAt,
      JSON.stringify(safeMetadata)
    ]);
    const event = eventKey
      ? queryOne(`SELECT * FROM usage_events WHERE event_key = ?`, [eventKey])
      : queryOne(`SELECT * FROM usage_events WHERE id = ?`, [id]);
    return { recorded: true, duplicate: event ? event.id !== id : false, event };
  } catch (error) {
    // Analytics must not break the business operation that produced the event.
    return { recorded: false, error: error.code || error.message };
  }
}

function getUsageEvents({ from, to, eventTypes = [], source, userId, limit = 500 } = {}) {
  const clauses = [];
  const params = [];
  if (from) { clauses.push('occurred_at >= ?'); params.push(from); }
  if (to) { clauses.push('occurred_at < ?'); params.push(to); }
  if (eventTypes.length) {
    clauses.push(`event_type IN (${eventTypes.map(() => '?').join(',')})`);
    params.push(...eventTypes);
  }
  if (source) { clauses.push('source = ?'); params.push(normalizeSource(source)); }
  if (userId !== undefined && userId !== null) { clauses.push('user_id = ?'); params.push(userId); }
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 5000));
  return query(`
    SELECT * FROM usage_events
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY occurred_at DESC
    LIMIT ${safeLimit}
  `, params);
}

module.exports = {
  VALID_SOURCES,
  normalizeSource,
  sanitizeMetadata,
  recordUsageEvent,
  getUsageEvents
};
