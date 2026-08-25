const crypto = require('crypto');

class WebhookSecurityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WebhookSecurityError';
    this.code = code;
  }
}

function headerValue(headers, name) {
  if (!headers) return '';
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (Array.isArray(direct)) return String(direct[0] || '');
  return String(direct || '');
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function validateTimestamp(value, nowMs, toleranceSeconds) {
  if (!/^\d+$/.test(String(value || ''))) {
    throw new WebhookSecurityError('WEBHOOK_TIMESTAMP_MISSING', 'Webhook 缺少有效时间戳');
  }
  const timestamp = Number(value);
  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestamp);
  if (ageSeconds > toleranceSeconds) {
    throw new WebhookSecurityError('WEBHOOK_TIMESTAMP_OUT_OF_RANGE', 'Webhook 时间戳超出允许窗口');
  }
  return timestamp;
}

function signingKey(signingSecret) {
  const value = String(signingSecret || '');
  if (!value.startsWith('whsec_')) {
    throw new WebhookSecurityError('WEBHOOK_CONFIG_INVALID', 'Webhook signing token 格式无效');
  }
  const key = Buffer.from(value.slice('whsec_'.length), 'base64');
  if (key.length !== 32) {
    throw new WebhookSecurityError('WEBHOOK_CONFIG_INVALID', 'Webhook signing token 必须编码 32-byte key');
  }
  return key;
}

function verifyHmac({ headers, rawBody, signingSecret, nowMs, toleranceSeconds }) {
  const eventId = headerValue(headers, 'webhook-id');
  const timestamp = headerValue(headers, 'webhook-timestamp');
  const signatureHeader = headerValue(headers, 'webhook-signature');
  if (!eventId || !signatureHeader) {
    throw new WebhookSecurityError('WEBHOOK_SIGNATURE_MISSING', 'Webhook 签名头不完整');
  }
  validateTimestamp(timestamp, nowMs, toleranceSeconds);
  const message = Buffer.concat([
    Buffer.from(`${eventId}.${timestamp}.`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '')
  ]);
  const expected = crypto.createHmac('sha256', signingKey(signingSecret)).update(message).digest('base64');
  const candidates = signatureHeader.split(/\s+/)
    .map(value => value.trim())
    .filter(value => value.startsWith('v1,'))
    .map(value => value.slice(3));
  if (!candidates.some(candidate => timingSafeTextEqual(candidate, expected))) {
    throw new WebhookSecurityError('WEBHOOK_SIGNATURE_INVALID', 'Webhook 签名校验失败');
  }
  return eventId;
}

function verifyLegacySecret({ headers, secret, nowMs, toleranceSeconds }) {
  const supplied = headerValue(headers, 'x-gitlab-token');
  if (!supplied || !timingSafeTextEqual(supplied, secret)) {
    throw new WebhookSecurityError('WEBHOOK_SECRET_INVALID', 'Webhook secret 校验失败');
  }
  const timestamp = headerValue(headers, 'webhook-timestamp');
  validateTimestamp(timestamp, nowMs, toleranceSeconds);
  const eventId = headerValue(headers, 'webhook-id')
    || headerValue(headers, 'idempotency-key')
    || headerValue(headers, 'x-gitlab-event-uuid');
  if (!eventId) {
    throw new WebhookSecurityError('WEBHOOK_EVENT_ID_MISSING', 'Webhook 缺少稳定事件 ID');
  }
  return eventId;
}

function verifyGitLabWebhook({
  headers,
  rawBody,
  env = process.env,
  nowMs = Date.now(),
  toleranceSeconds = 300
}) {
  const signingSecret = env.GITLAB_WEBHOOK_SIGNING_SECRET;
  const legacySecret = env.GITLAB_WEBHOOK_SECRET;
  if (!signingSecret && !legacySecret) {
    throw new WebhookSecurityError('WEBHOOK_NOT_CONFIGURED', 'GitLab Webhook 验证密钥未配置');
  }
  const eventId = signingSecret
    ? verifyHmac({ headers, rawBody, signingSecret, nowMs, toleranceSeconds })
    : verifyLegacySecret({ headers, secret: legacySecret, nowMs, toleranceSeconds });
  const eventType = headerValue(headers, 'x-gitlab-event') || 'Unknown Hook';
  return { eventId, eventType, verification: signingSecret ? 'hmac-sha256' : 'legacy-secret' };
}

module.exports = {
  WebhookSecurityError,
  headerValue,
  timingSafeTextEqual,
  verifyGitLabWebhook
};
