const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-collaboration-events-'));
const dbPath = path.join(tempRoot, 'events.db');
const database = require('../database/db');
const {
  getAuditEvents,
  getWebhookEvent,
  payloadDigest,
  processWebhookEvent,
  recordAuditEvent,
  registerWebhookEvent,
  sanitizeMetadata
} = require('../services/collaboration-events');
const {
  WebhookSecurityError,
  verifyGitLabWebhook
} = require('../services/webhook-security');

test.before(async () => {
  await database.initDatabase({ path: dbPath });
});

test.after(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('webhook registration stores only a stable digest and deduplicates event IDs', () => {
  const payload = { z: 1, nested: { b: 2, a: 1 } };
  const first = registerWebhookEvent({
    provider: 'gitlab', eventId: 'event-1', eventType: 'Push Hook', payload
  });
  const second = registerWebhookEvent({
    provider: 'gitlab', eventId: 'event-1', eventType: 'Push Hook', payload: { changed: true }
  });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.event.payload_digest, payloadDigest(payload));
  assert.equal(database.query(`SELECT * FROM webhook_events WHERE event_id = 'event-1'`).length, 1);
  assert.equal(JSON.stringify(first.event).includes('nested'), false);
});

test('processed webhook replay never invokes the handler twice', async () => {
  let calls = 0;
  const input = {
    provider: 'gitlab',
    eventId: 'event-processed',
    eventType: 'Merge Request Hook',
    payload: { object_kind: 'merge_request' },
    handler: async () => { calls += 1; return { ok: true }; }
  };
  const first = await processWebhookEvent(input);
  const replay = await processWebhookEvent(input);
  assert.equal(first.processed, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.processed, true);
  assert.equal(calls, 1);
});

test('failed webhook can retry without creating a second event', async () => {
  let calls = 0;
  const input = {
    provider: 'gitlab',
    eventId: 'event-retry',
    eventType: 'Pipeline Hook',
    payload: { object_kind: 'pipeline' },
    handler: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('sensitive upstream detail');
        error.code = 'UPSTREAM_TEMPORARY';
        throw error;
      }
      return { ok: true };
    }
  };
  await assert.rejects(() => processWebhookEvent(input), /sensitive upstream detail/);
  assert.equal(getWebhookEvent('gitlab', 'event-retry').status, 'failed');
  assert.equal(getWebhookEvent('gitlab', 'event-retry').error, 'UPSTREAM_TEMPORARY');
  const retry = await processWebhookEvent(input);
  assert.equal(retry.processed, true);
  assert.equal(calls, 2);
  assert.equal(database.query(`SELECT * FROM webhook_events WHERE event_id = 'event-retry'`).length, 1);
});

test('audit metadata removes sensitive values recursively and bounds content', () => {
  const metadata = {
    safe: 'visible',
    accessToken: 'secret-token',
    nested: {
      authorization: 'Bearer secret',
      sourceCode: 'private source',
      status: 'ok'
    },
    longText: 'a'.repeat(800)
  };
  const sanitized = sanitizeMetadata(metadata);
  assert.equal(sanitized.safe, 'visible');
  assert.equal('accessToken' in sanitized, false);
  assert.equal('authorization' in sanitized.nested, false);
  assert.equal('sourceCode' in sanitized.nested, false);
  assert.equal(sanitized.nested.status, 'ok');
  assert.ok(sanitized.longText.length <= 501);

  const event = recordAuditEvent({
    actorUserId: null,
    delegatedSessionId: null,
    action: 'webhook.received',
    resourceType: 'project',
    resourceId: 'p1',
    result: 'accepted',
    metadata
  });
  const stored = getAuditEvents({ resourceType: 'project', resourceId: 'p1' });
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].metadata, event.metadata);
  assert.equal(JSON.stringify(stored[0].metadata).includes('secret-token'), false);
});

test('GitLab HMAC webhook verification follows messageId.timestamp.rawBody', () => {
  const key = crypto.randomBytes(32);
  const signingSecret = `whsec_${key.toString('base64')}`;
  const rawBody = Buffer.from('{"object_kind":"push","project_id":7}', 'utf8');
  const eventId = 'message-123';
  const timestamp = '1786665600';
  const signature = crypto.createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(`${eventId}.${timestamp}.`), rawBody]))
    .digest('base64');
  const result = verifyGitLabWebhook({
    headers: {
      'webhook-id': eventId,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,invalid v1,${signature}`,
      'x-gitlab-event': 'Push Hook'
    },
    rawBody,
    env: { GITLAB_WEBHOOK_SIGNING_SECRET: signingSecret },
    nowMs: Number(timestamp) * 1000
  });
  assert.deepEqual(result, { eventId, eventType: 'Push Hook', verification: 'hmac-sha256' });
});

test('GitLab legacy webhook verification requires secret, event ID, and fresh timestamp', () => {
  const nowSeconds = 1786665600;
  const result = verifyGitLabWebhook({
    headers: {
      'x-gitlab-token': 'legacy-secret',
      'x-gitlab-event-uuid': 'legacy-event',
      'x-gitlab-event': 'Project Hook',
      'webhook-timestamp': String(nowSeconds)
    },
    rawBody: Buffer.from('{}'),
    env: { GITLAB_WEBHOOK_SECRET: 'legacy-secret' },
    nowMs: nowSeconds * 1000
  });
  assert.equal(result.eventId, 'legacy-event');
  assert.equal(result.verification, 'legacy-secret');
});

test('GitLab webhook verification rejects stale or unconfigured requests', () => {
  assert.throws(
    () => verifyGitLabWebhook({ headers: {}, rawBody: Buffer.from('{}'), env: {} }),
    error => error instanceof WebhookSecurityError && error.code === 'WEBHOOK_NOT_CONFIGURED'
  );
  assert.throws(
    () => verifyGitLabWebhook({
      headers: {
        'x-gitlab-token': 'secret',
        'x-gitlab-event-uuid': 'event',
        'webhook-timestamp': '100'
      },
      rawBody: Buffer.from('{}'),
      env: { GITLAB_WEBHOOK_SECRET: 'secret' },
      nowMs: 1000 * 1000
    }),
    error => error instanceof WebhookSecurityError && error.code === 'WEBHOOK_TIMESTAMP_OUT_OF_RANGE'
  );
});

test('GitLab webhook HTTP route preserves raw bytes and acknowledges replay idempotently', async () => {
  const key = crypto.randomBytes(32);
  const signingSecret = `whsec_${key.toString('base64')}`;
  const previousSigningSecret = process.env.GITLAB_WEBHOOK_SIGNING_SECRET;
  const previousLegacySecret = process.env.GITLAB_WEBHOOK_SECRET;
  process.env.GITLAB_WEBHOOK_SIGNING_SECRET = signingSecret;
  delete process.env.GITLAB_WEBHOOK_SECRET;

  const app = express();
  app.use(
    '/api/collaboration/webhooks/gitlab',
    express.raw({ type: 'application/json', limit: '2mb' }),
    require('../routes/collaboration-webhooks')
  );
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const rawBody = Buffer.from('{"object_kind":"push","project_id":77}', 'utf8');
    const eventId = 'route-event-1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac('sha256', key)
      .update(Buffer.concat([Buffer.from(`${eventId}.${timestamp}.`), rawBody]))
      .digest('base64');
    const request = () => fetch(`http://127.0.0.1:${server.address().port}/api/collaboration/webhooks/gitlab`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': eventId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${signature}`,
        'x-gitlab-event': 'Push Hook'
      },
      body: rawBody
    });

    const firstResponse = await request();
    const firstBody = await firstResponse.json();
    const replayResponse = await request();
    const replayBody = await replayResponse.json();

    assert.equal(firstResponse.status, 202);
    assert.equal(firstBody.data.duplicate, false);
    assert.equal(replayResponse.status, 200);
    assert.equal(replayBody.data.duplicate, true);
    assert.equal(getWebhookEvent('gitlab', eventId).status, 'processed');
    assert.equal(getAuditEvents({ resourceType: 'gitlab_project', resourceId: '77' }).length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (previousSigningSecret === undefined) delete process.env.GITLAB_WEBHOOK_SIGNING_SECRET;
    else process.env.GITLAB_WEBHOOK_SIGNING_SECRET = previousSigningSecret;
    if (previousLegacySecret === undefined) delete process.env.GITLAB_WEBHOOK_SECRET;
    else process.env.GITLAB_WEBHOOK_SECRET = previousLegacySecret;
  }
});
