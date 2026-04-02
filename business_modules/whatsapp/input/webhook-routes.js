/**
 * Fastify plugin that registers WhatsApp Business Cloud API webhook routes.
 * GET  /api/webhooks/whatsapp — Meta verification handshake
 * POST /api/webhooks/whatsapp — Incoming message webhook
 */

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ ingestService, apiAdapter, verifyToken: string }} opts
 */
export async function whatsappWebhookPlugin(fastify, { ingestService, apiAdapter, verifyToken }) {
  // Meta webhook verification (called once when you configure the webhook URL)
  fastify.get('/api/webhooks/whatsapp', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    const result = apiAdapter.verifyWebhook(mode, token, challenge, verifyToken);
    if (result.ok) {
      return reply.code(200).send(result.challenge);
    }
    return reply.code(403).send('Forbidden');
  });

  // Incoming message webhook — return 200 fast, process async
  fastify.post('/api/webhooks/whatsapp', async (request, reply) => {
    // Meta requires a fast 200 response
    reply.code(200).send('EVENT_RECEIVED');

    // Process entries asynchronously after responding
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
