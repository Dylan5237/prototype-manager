const crypto = require('crypto');
const { query, queryOne, runInTransaction } = require('../database/db');

const SENSITIVE_KEY = /(?:token|secret|password|authorization|credential|private.?key|source.?code|prompt|requirement)/i;

function now() {
  return new Date().toISOString();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function payloadDigest(payload) {
  const content = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(typeof payload === 'string' ? payload : stableJson(payload), 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sanitizeMetadata(value, depth = 0) {
  if (depth > 5) return '[truncated-depth]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitizeMetadata(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).slice(0, 50).forEach(key => {
      if (!SENSITIVE_KEY.test(key)) result[key] = sanitizeMetadata(value[key], depth + 1);
    });
    return result;
  }
  return String(value).slice(0, 500);
}

function getWebhookEvent(provider, eventId) {
  return queryOne(`
    SELECT * FROM webhook_events WHERE provider = ? AND event_id = ?
  `, [provider, eventId]);
}

function registerWebhookEvent({ provider, eventId, eventType, payload }) {
  if (!provider || !eventId || !eventType) throw new TypeError('provider、eventId、eventType 不能为空');
  const digest = payloadDigest(payload);
  return runInTransaction(db => {
    const existing = getWebhookEvent(provider, eventId);
    if (existing) return { event: existing, duplicate: true };
    db.run(`
      INSERT INTO webhook_events
        (provider, event_id, event_type, payload_digest, status, received_at)
      VALUES (?, ?, ?, ?, 'received', ?)
    `, [provider, eventId, eventType, digest, now()]);
    return { event: getWebhookEvent(provider, eventId), duplicate: false };
  });
}

function updateWebhookEvent(provider, eventId, fields) {
  const allowed = ['status', 'processed_at', 'error'];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (!entries.length) return getWebhookEvent(provider, eventId);
  return runInTransaction(db => {
    db.run(`
      UPDATE webhook_events
      SET ${entries.map(([key]) => `${key} = ?`).join(', ')}
      WHERE provider = ? AND event_id = ?
    `, [...entries.map(([, value]) => value), provider, eventId]);
    return getWebhookEvent(provider, eventId);
  });
}

function recordAuditEvent({
  actorUserId = null,
  delegatedSessionId = null,
  action,
  resourceType,
  resourceId,
  result,
  metadata = {}
}) {
  const event = {
    id: crypto.randomUUID(),
    actorUserId,
    delegatedSessionId,
    action,
    resourceType,
    resourceId: String(resourceId),
    result,
    metadata: sanitizeMetadata(metadata),
    createdAt: now()
  };
  runInTransaction(db => {
    db.run(`
      INSERT INTO audit_events
        (id, actor_user_id, delegated_session_id, action, resource_type, resource_id,
         result, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      event.id, event.actorUserId, event.delegatedSessionId, event.action,
      event.resourceType, event.resourceId, event.result,
      JSON.stringify(event.metadata), event.createdAt
    ]);
  });
  return event;
}

async function processWebhookEvent({ provider, eventId, eventType, payload, handler }) {
  if (typeof handler !== 'function') throw new TypeError('handler 必须是函数');
  const registered = registerWebhookEvent({ provider, eventId, eventType, payload });
  const current = registered.event;
  if (registered.duplicate && (current.status === 'processing' || current.status === 'processed')) {
    return { duplicate: true, processed: current.status === 'processed', event: current };
  }

  updateWebhookEvent(provider, eventId, { status: 'processing', processed_at: null, error: null });
  try {
    const result = await handler({ provider, eventId, eventType, payload });
    const event = updateWebhookEvent(provider, eventId, {
      status: 'processed',
      processed_at: now(),
      error: null
    });
    return { duplicate: registered.duplicate, processed: true, event, result };
  } catch (error) {
    const safeError = String(error && error.code ? error.code : 'WEBHOOK_HANDLER_FAILED').slice(0, 160);
    updateWebhookEvent(provider, eventId, {
      status: 'failed',
      processed_at: now(),
      error: safeError
    });
    throw error;
  }
}

function getAuditEvents({ resourceType, resourceId, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const clauses = [];
  const params = [];
  if (resourceType) { clauses.push('resource_type = ?'); params.push(resourceType); }
  if (resourceId) { clauses.push('resource_id = ?'); params.push(String(resourceId)); }
  return query(`
    SELECT * FROM audit_events
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `, params).map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata_json || '{}')
  }));
}

module.exports = {
  getAuditEvents,
  getWebhookEvent,
  payloadDigest,
  processWebhookEvent,
  recordAuditEvent,
  registerWebhookEvent,
  sanitizeMetadata,
  stableJson
};
