import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { pboReviewRoutes } from '../../../business_modules/pbo_report_review/input/pboReviewRoutes.js';
import { registerWhatsappRawBodyHook } from '../../../cross-cut-modules/security/input/registerSecurityPlugins.js';

const SECRET_BYTES = Buffer.from('inbound-email-test-secret-32byte');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const URL = '/api/pbo/review/inbound-email';

function svixHeaders(body, { id = 'msg_1', timestamp = String(Math.floor(Date.now() / 1000)), key = SECRET_BYTES } = {}) {
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${sig}`,
  };
}

describe('POST /api/pbo/review/inbound-email', () => {
  let app;
  let handled;
  const savedSecret = process.env.RESEND_WEBHOOK_SECRET;
  const savedNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    handled = [];
    app = Fastify();
    registerWhatsappRawBodyHook(app);
    await pboReviewRoutes(app, {
      pboReportReviewService: {
        async handleInboundEmail(body) {
          handled.push(body);
          return { id: 'rev-1' };
        },
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    if (savedSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = savedSecret;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
  });

  it('accepts a correctly signed webhook (raw-body based)', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const body = '{"type": "email.received",  "data": {"x": 1}}';
    const res = await app.inject({ method: 'POST', url: URL, headers: svixHeaders(body), payload: body });
    assert.equal(res.statusCode, 200);
    assert.equal(handled.length, 1);
  });

  it('rejects a bad signature with 401', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const body = '{"type":"email.received"}';
    const headers = { ...svixHeaders(body, { key: Buffer.from('wrong-key') }) };
    const res = await app.inject({ method: 'POST', url: URL, headers, payload: body });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().code, 'signature_mismatch');
    assert.equal(handled.length, 0);
  });

  it('rejects missing signature headers with 401 when secret is set', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'application/json' },
      payload: '{"type":"email.received"}',
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().code, 'missing_signature_headers');
  });

  it('rejects stale timestamps with 401 (replay guard)', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const body = '{"type":"email.received"}';
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: svixHeaders(body, { timestamp: stale }),
      payload: body,
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().code, 'timestamp_out_of_tolerance');
  });

  it('fails closed in production when no secret is configured', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'application/json' },
      payload: '{"type":"email.received"}',
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().code, 'webhook_not_configured');
    assert.equal(handled.length, 0);
  });

  it('allows unsigned requests outside production when no secret is configured', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'test';
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'application/json' },
      payload: '{"type":"email.received"}',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(handled.length, 1);
  });
});
