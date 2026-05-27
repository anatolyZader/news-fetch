/**
 * Fastify routes for radio/audio ingest (pre-analysis transcript markdown).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ radioIngestReadService?: ReturnType<import('../app/radioIngestReadService.js').createRadioIngestReadService>, authPreHandler?: any }} opts
 */
export async function radioRoutes(app, opts) {
  const radioIngestReadService = opts?.radioIngestReadService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/radio', preHandler, async (_request, reply) => {
    if (!radioIngestReadService) {
      return reply.code(503).send({ error: 'radio ingest service not configured' });
    }
    try {
      return reply.send(radioIngestReadService.getDashboard());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load radio dashboard' });
    }
  });

  app.get('/api/radio/daily', preHandler, async (request, reply) => {
    if (!radioIngestReadService) {
      return reply.code(503).send({ error: 'radio ingest service not configured' });
    }
    const date = String(request.query?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date query param required (YYYY-MM-DD)' });
    }
    try {
      const feed = radioIngestReadService.getDailyFeed(date);
      if (!feed) return reply.code(404).send({ error: 'Daily radio feed not found' });
      return reply.send(feed);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load daily radio feed' });
    }
  });
}
