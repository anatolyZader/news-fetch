import { basename } from 'path';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ service: ReturnType<import('../app/chatbotManualReportsService.js').createChatbotManualReportsService>, authPreHandler?: any }} opts
 */
export async function chatbotManualReportsRoutes(app, opts) {
  const service = opts?.service ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/chatbot/manual-reports', preHandler, async (_request, reply) => {
    if (!service) {
      return reply.code(503).send({ error: 'chatbot manual reports service not configured' });
    }
    try {
      return reply.send(service.getDashboard());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load chatbot reports' });
    }
  });

  app.get('/api/chatbot/manual-reports/file', preHandler, async (request, reply) => {
    if (!service) {
      return reply.code(503).send({ error: 'chatbot manual reports service not configured' });
    }
    const name = String(request.query?.name ?? '').trim();
    if (!name) {
      return reply.code(400).send({ error: 'name query parameter is required' });
    }
    try {
      const content = service.getFileText(name);
      return reply.send({ fileName: basename(name), content });
    } catch (err) {
      const msg = err?.message ?? 'Not found';
      return reply.code(404).send({ error: msg });
    }
  });
}
