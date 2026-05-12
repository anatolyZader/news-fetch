import { basename } from 'path';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ service: ReturnType<import('../app/reportBotManualReportsService.js').createReportBotManualReportsService>, authPreHandler?: any }} opts
 */
export async function reportBotManualReportsRoutes(app, opts) {
  const service = opts?.service ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/report-bot/manual-reports', preHandler, async (_request, reply) => {
    if (!service) {
      return reply.code(503).send({ error: 'report bot manual reports service not configured' });
    }
    try {
      return reply.send(service.getDashboard());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load report bot manual reports' });
    }
  });

  app.get('/api/report-bot/manual-reports/file', preHandler, async (request, reply) => {
    if (!service) {
      return reply.code(503).send({ error: 'report bot manual reports service not configured' });
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
