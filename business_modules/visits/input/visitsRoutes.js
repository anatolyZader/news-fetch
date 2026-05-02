/**
 * Fastify routes for professional squad visit dashboards.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ visitsService: ReturnType<import('../app/visitsService.js').createVisitsService>, authPreHandler?: any }} opts
 */
export async function visitsRoutes(app, opts) {
  const visitsService = opts?.visitsService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/visits', preHandler, async (_request, reply) => {
    if (!visitsService) {
      return reply.code(503).send({ error: 'visits service not configured' });
    }

    try {
      return reply.send(visitsService.getDashboard());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load visits data' });
    }
  });
}
