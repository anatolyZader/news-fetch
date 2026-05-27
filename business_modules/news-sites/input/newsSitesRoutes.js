/**
 * Fastify routes for homefront news ingest (pre-analysis markdown exports).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ newsSitesService?: ReturnType<import('../app/newsSitesService.js').createNewsSitesService>, authPreHandler?: any }} opts
 */
export async function newsSitesRoutes(app, opts) {
  const newsSitesService = opts?.newsSitesService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/news-sites', preHandler, async (_request, reply) => {
    if (!newsSitesService) {
      return reply.code(503).send({ error: 'news sites service not configured' });
    }
    try {
      return reply.send(newsSitesService.getDashboard());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load news dashboard' });
    }
  });

  app.get('/api/news-sites/daily', preHandler, async (request, reply) => {
    if (!newsSitesService) {
      return reply.code(503).send({ error: 'news sites service not configured' });
    }
    const date = String(request.query?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date query param required (YYYY-MM-DD)' });
    }
    try {
      const feed = newsSitesService.getDailyFeed(date);
      if (!feed) return reply.code(404).send({ error: 'Daily news feed not found' });
      return reply.send(feed);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load daily news feed' });
    }
  });
}
