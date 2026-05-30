import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { whatsappWebhookPlugin } from '../../../business_modules/whatsapp/input/webhook-routes.js';
import { registerWhatsappRawBodyHook } from '../../../cross-cut-modules/security/input/registerSecurityPlugins.js';

function stubAdapter() {
  return {
    verifyWebhook(mode, token, challenge, verifyToken) {
      if (mode === 'subscribe' && token === verifyToken) {
        return { ok: true, challenge };
      }
      return { ok: false };
    },
  };
}

describe('whatsappWebhookPlugin signatures', () => {
  let app;
  let handled;

  beforeEach(async () => {
    handled = 0;
    app = Fastify();
    registerWhatsappRawBodyHook(app);
    await app.register(whatsappWebhookPlugin, {
      ingestService: {
        async handleIncomingMessage() {
          handled += 1;
        },
      },
      apiAdapter: stubAdapter(),
      verifyToken: 'verify-me',
      appSecret: 'test-secret',
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts valid HMAC signature', async () => {
    const body = '{"entry":[{"id":"1"}]}';
    const sig = `sha256=${createHmac('sha256', 'test-secret').update(body).digest('hex')}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sig,
      },
      payload: body,
    });
    assert.equal(res.statusCode, 200);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(handled, 1);
  });

  it('rejects invalid signature when secret configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=bad' },
      payload: '{"entry":[]}',
    });
    assert.equal(res.statusCode, 403);
    assert.equal(handled, 0);
  });

  it('rejects POST when verify token configured but secret missing', async () => {
    await app.close();
    app = Fastify();
    registerWhatsappRawBodyHook(app);
    await app.register(whatsappWebhookPlugin, {
      ingestService: { async handleIncomingMessage() { handled += 1; } },
      apiAdapter: stubAdapter(),
      verifyToken: 'verify-me',
      appSecret: '',
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/whatsapp',
      headers: { 'content-type': 'application/json' },
      payload: '{"entry":[]}',
    });
    assert.equal(res.statusCode, 403);
  });
});
