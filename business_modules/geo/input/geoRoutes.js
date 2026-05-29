/**
 * Internal Fastify routes for geo resolution (auth when app uses authHook).
 * @param {import('fastify').FastifyInstance} app
 * @param {{ authPreHandler?: import('fastify').preHandlerHookHandler }} [opts]
 */
export async function registerGeoRoutes(app, opts = {}) {
  const pre = opts.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/geo/localities', pre, async (request, reply) => {
    const q = typeof request.query?.q === 'string' ? request.query.q : '';
    const scope = typeof request.query?.scope === 'string' ? request.query.scope : 'north';
    const geoService = app.geoService;
    if (!geoService?.searchLocalities) {
      return reply.code(503).send({ error: 'geo service not available' });
    }
    const localities = geoService.searchLocalities(q, { scope, limit: 20 });
    return reply.send({ localities });
  });

  app.get('/api/geo/resolve', pre, async (request, reply) => {
    const raw = request.query?.name ?? request.query?.q;
    if (typeof raw !== 'string' || !raw.trim()) {
      return reply.code(400).send({ error: 'Missing query parameter: name (or q)' });
    }
    const geoService = app.geoService;
    if (!geoService?.resolveLocalityName) {
      return reply.code(503).send({ error: 'geo service not available' });
    }
    const result = geoService.resolveLocalityName(raw.trim());
    return reply.send(result);
  });
}
