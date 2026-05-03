/**
 * Fastify routes for the resilience drift dashboard (N4).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   driftService: ReturnType<import('../app/driftService.js').createDriftService>,
 *   authPreHandler?: Function,
 * }} opts
 */
export async function registerDriftRoutes(app, opts) {
  const driftService = opts?.driftService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/resilience/drift', preHandler, async (request, reply) => {
    if (!driftService) {
      return reply.code(503).send({ error: 'drift service not configured' });
    }
    const scope = request.query?.scope === 'north' ? 'north' : 'national';
    const daysRaw = request.query?.days;
    const days = (() => {
      const n = Number.parseInt(daysRaw ?? '30', 10);
      if (!Number.isFinite(n) || n <= 0) return 30;
      return Math.min(n, 90);
    })();
    try {
      const data = driftService.compute({ scope, days });
      return reply.send(data);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'failed to compute drift' });
    }
  });
}
