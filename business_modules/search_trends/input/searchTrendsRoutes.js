import { normalizeTrendWindowDays } from '../domain/trendWindowDays.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   searchTrendsService?: ReturnType<import('../app/searchTrendsService.js').createSearchTrendsService>,
 *   authPreHandler?: import('fastify').preHandlerHookHandler,
 * }} [opts]
 */
export async function registerSearchTrendsRoutes(app, opts = {}) {
  const pre = opts.authPreHandler ? { preHandler: opts.authPreHandler } : {};
  const svc = opts.searchTrendsService;

  app.get('/api/search-trends/districts', pre, async (_request, reply) => {
    if (!svc) return reply.code(503).send({ error: 'search trends service not configured' });
    return reply.send({ districts: svc.listDistricts() });
  });

  app.get('/api/search-trends/topic-groups', pre, async (_request, reply) => {
    if (!svc) return reply.code(503).send({ error: 'search trends service not configured' });
    return reply.send({ topicGroups: svc.listTopicGroups() });
  });

  app.get('/api/search-trends/dashboard', pre, async (request, reply) => {
    if (!svc) return reply.code(503).send({ error: 'search trends service not configured' });
    const districtId = request.query?.district ?? request.query?.scope ?? 'national';
    const daysRaw = request.query?.days;
    const refresh = request.query?.refresh === '1' || request.query?.refresh === 'true';
    const days = normalizeTrendWindowDays(daysRaw, 7);
    try {
      const data = await svc.getDashboard({ districtId, days, refresh });
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load search trends' });
    }
  });
}
