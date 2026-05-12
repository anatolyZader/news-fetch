/**
 * HTTP routes for the Pools area (education + Naftali dashboards).
 * @param {import('fastify').FastifyInstance} app
 * @param {{ authPreHandler?: import('fastify').preHandlerHookHandler, poolService?: { getEducationDashboard: Function, getNaftaliDashboard: Function } }} [opts]
 */
export async function registerPoolRoutes(app, opts = {}) {
  const pre = opts.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/education-sessions', pre, async (request, reply) => {
    const poolSvc = opts.poolService ?? app.poolService;
    if (!poolSvc?.getEducationDashboard) {
      return reply.code(503).send({ error: 'pool service not available' });
    }
    const forceRefresh = request.query?.refresh === '1';
    try {
      const data = await poolSvc.getEducationDashboard({ forceRefresh });
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load education data' });
    }
  });

  app.get('/api/naftali', pre, async (request, reply) => {
    const poolSvc = opts.poolService ?? app.poolService;
    if (!poolSvc?.getNaftaliDashboard) {
      return reply.code(503).send({ error: 'pool service not available' });
    }
    const forceRefresh = request.query?.refresh === '1';
    try {
      const data = await poolSvc.getNaftaliDashboard({ forceRefresh });
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load Naftali data' });
    }
  });
}
