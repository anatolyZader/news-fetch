/**
 * Fastify plugin that registers WhatsApp Business Cloud API webhook routes.
 * GET  /api/webhooks/whatsapp — Meta verification handshake
 * POST /api/webhooks/whatsapp — Incoming message webhook
 */

import { verifyWhatsAppWebhookSignature } from '../../../cross-cut-modules/security/infrastructure/whatsappSignature.js';

function toRawBodyBuffer(rawBody) {
  if (rawBody === null || rawBody === undefined) return null;
  return Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
}

function verifyWebhookSignature(request, secret) {
  const raw = toRawBodyBuffer(request.rawBody);
  if (!raw) {
    return { ok: false, code: 'missing_raw_body' };
  }
  const sig = request.headers['x-hub-signature-256'];
  const verified = verifyWhatsAppWebhookSignature(raw.toString('utf8'), sig, secret);
  if (!verified.ok) {
    return { ok: false, code: verified.reason ?? 'invalid_signature' };
  }
  return { ok: true };
}

async function processWebhookEntries(entries, ingestService) {
  for (const entry of entries) {
    try {
      await ingestService.handleIncomingMessage(entry);
    } catch (err) {
      console.error('WhatsApp webhook processing error:', err);
    }
  }
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ ingestService, apiAdapter, verifyToken: string, appSecret?: string }} opts
 */
export async function whatsappWebhookPlugin(fastify, { ingestService, apiAdapter, verifyToken, appSecret }) {
  const secret = (appSecret ?? process.env.WHATSAPP_APP_SECRET ?? '').trim();
  const verifyTokenConfigured = !!(verifyToken ?? '').trim();

  fastify.get('/api/webhooks/whatsapp', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    const result = apiAdapter.verifyWebhook(mode, token, challenge, verifyToken);
    if (result.ok) {
      return reply.type('text/plain').code(200).send(result.challenge);
    }
    return reply.code(403).send('Forbidden');
  });

  fastify.post('/api/webhooks/whatsapp', async (request, reply) => {
    if (verifyTokenConfigured && !secret) {
      return reply.code(403).send({ error: 'Forbidden', code: 'missing_app_secret' });
    }
    if (secret) {
      const verified = verifyWebhookSignature(request, secret);
      if (!verified.ok) {
        return reply.code(403).send({ error: 'Forbidden', code: verified.code });
      }
    }

    reply.code(200).send('EVENT_RECEIVED');
    await processWebhookEntries(request.body?.entry ?? [], ingestService);
  });
}
