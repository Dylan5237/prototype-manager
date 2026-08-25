const express = require('express');
const {
  processWebhookEvent,
  recordAuditEvent
} = require('../services/collaboration-events');
const {
  WebhookSecurityError,
  verifyGitLabWebhook
} = require('../services/webhook-security');

const router = express.Router();

function statusFor(error) {
  if (error.code === 'WEBHOOK_NOT_CONFIGURED' || error.code === 'WEBHOOK_CONFIG_INVALID') return 503;
  if (/SIGNATURE|SECRET/.test(error.code || '')) return 401;
  if (/TIMESTAMP|EVENT_ID/.test(error.code || '')) return 400;
  return 500;
}

router.post('/', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    return res.status(400).json({ success: false, code: 'WEBHOOK_JSON_INVALID', message: 'Webhook JSON 无效' });
  }

  try {
    const verified = verifyGitLabWebhook({ headers: req.headers, rawBody });
    const result = await processWebhookEvent({
      provider: 'gitlab',
      eventId: verified.eventId,
      eventType: verified.eventType,
      payload,
      handler: async () => {
        const projectId = payload.project_id || (payload.project && payload.project.id) || verified.eventId;
        recordAuditEvent({
          action: 'webhook.received',
          resourceType: 'gitlab_project',
          resourceId: projectId,
          result: 'accepted',
          metadata: {
            eventId: verified.eventId,
            eventType: verified.eventType,
            verification: verified.verification,
            objectKind: payload.object_kind || payload.event_name || null
          }
        });
        return { accepted: true };
      }
    });
    return res.status(result.duplicate ? 200 : 202).json({
      success: true,
      data: {
        eventId: verified.eventId,
        duplicate: result.duplicate,
        status: result.event.status
      }
    });
  } catch (error) {
    const status = statusFor(error);
    const safeCode = error.code || 'WEBHOOK_PROCESSING_FAILED';
    const safeMessage = error instanceof WebhookSecurityError
      ? error.message
      : 'Webhook 处理失败，可安全重试';
    return res.status(status).json({ success: false, code: safeCode, message: safeMessage });
  }
});

module.exports = router;
