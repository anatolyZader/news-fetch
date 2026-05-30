/**
 * Fastify plugin that registers WhatsApp Business Cloud API webhook routes.
 * GET  /api/webhooks/whatsapp — Meta verification handshake
 * POST /api/webhooks/whatsapp — Incoming message webhook
 */

import { verifyWhatsAppWebhookSignature } from '../../../cross-cut-modules/security/infrastructure/whatsappSignature.js';

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
    const rawBody = request.rawBody;
    if (verifyTokenConfigured && !secret) {
      return reply.code(403).send({ error: 'Forbidden', code: 'missing_app_secret' });
    }
    if (secret) {
      const sig = request.headers['x-hub-signature-256'];
      let raw = null;
      if (rawBody !== null && rawBody !== undefined) {
        if (Buffer.isBuffer(rawBody)) {
          raw = rawBody;
        } else {
          raw = Buffer.from(String(rawBody));
        }
      }
      if (!raw) {
        return reply.code(403).send({ error: 'Forbidden', code: 'missing_raw_body' });
      }
      const verified = verifyWhatsAppWebhookSignature(raw.toString('utf8'), sig, secret);
      if (!verified.ok) {
        return reply.code(403).send({ error: 'Forbidden', code: verified.reason ?? 'invalid_signature' });
      }
    }

    reply.code(200).send('EVENT_RECEIVED');

    const entries = request.body?.entry ?? [];
    for (const entry of entries) {
      try {
        await ingestService.handleIncomingMessage(entry);
      } catch (err) {
        console.error('WhatsApp webhook processing error:', err);
      }
    }
  });
}
