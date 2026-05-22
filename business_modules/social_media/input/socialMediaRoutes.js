/**
 * Fastify routes for social-media OSINT reports and feeds.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ socialMediaService?: ReturnType<import('../app/socialMediaService.js').createSocialMediaService>, authPreHandler?: any }} opts
 */
export async function socialMediaRoutes(app, opts) {
  const socialMediaService = opts?.socialMediaService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/social-media', preHandler, async (_request, reply) => {
    if (!socialMediaService) {
      return reply.code(503).send({ error: 'social media service not configured' });
    }
    try {
      return reply.send(await socialMediaService.getDashboard());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load social media dashboard' });
    }
  });

  app.get('/api/social-media/platforms', preHandler, async (_request, reply) => {
    if (!socialMediaService) {
      return reply.code(503).send({ error: 'social media service not configured' });
    }
    return reply.send(socialMediaService.getPlatforms());
  });

  app.get('/api/social-media/daily', preHandler, async (request, reply) => {
    if (!socialMediaService) {
      return reply.code(503).send({ error: 'social media service not configured' });
    }
    const date = String(request.query?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date query param required (YYYY-MM-DD)' });
    }
    const categoryId = String(request.query?.category ?? '').trim() || undefined;
    const lang = String(request.query?.lang ?? '').trim() || undefined;
    try {
      const feed = await socialMediaService.getDailyFeed(date, { categoryId, lang });
      if (!feed) return reply.code(404).send({ error: 'Daily feed not found' });
      return reply.send(feed);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load daily feed' });
    }
  });

  app.post('/api/social-media/fetch-topic', preHandler, async (request, reply) => {
    if (!socialMediaService) {
      return reply.code(503).send({ error: 'social media service not configured' });
    }
    const { topic, platforms, execute, maxCostUsd, maxPerQuery, lang } = request.body ?? {};
    if (typeof topic !== 'string' || !topic.trim()) {
      return reply.code(400).send({ error: 'topic is required' });
    }
    try {
      const result = await socialMediaService.fetchByTopic({
        topic,
        platforms,
        execute: Boolean(execute),
        maxCostUsd,
        maxPerQuery,
        lang: typeof lang === 'string' ? lang.trim() : undefined,
      });
      return reply.send(result);
    } catch (err) {
      const msg = err?.message ?? 'Failed to fetch topic';
      const code = msg.includes('at least 2') ? 400 : 502;
      return reply.code(code).send({ error: msg });
    }
  });

  app.get('/api/social-media/topic-fetches', preHandler, async (request, reply) => {
    if (!socialMediaService) {
      return reply.code(503).send({ error: 'social media service not configured' });
    }
    const limit = Math.min(Math.max(Number(request.query?.limit ?? 30), 1), 100);
    try {
      const searches = await socialMediaService.listTopicFetchHistory(limit);
      return reply.send({ searches });
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to list topic fetches' });
    }
  });

  app.get('/api/social-media/topic-fetches/:id', preHandler, async (request, reply) => {
    if (!socialMediaService) {
      return reply.code(503).send({ error: 'social media service not configured' });
    }
    const id = String(request.params?.id ?? '').trim();
    const lang = String(request.query?.lang ?? '').trim() || undefined;
    try {
      const result = await socialMediaService.getTopicFetch(id, { lang });
      if (!result) return reply.code(404).send({ error: 'Topic fetch not found' });
      return reply.send(result);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load topic fetch' });
    }
  });

  app.get('/api/social-media/report', preHandler, async (request, reply) => {
    if (!socialMediaService) {
      return reply.code(503).send({ error: 'social media service not configured' });
    }
    const date = String(request.query?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date query param required (YYYY-MM-DD)' });
    }
    try {
      const report = await socialMediaService.getReport(date);
      if (!report) return reply.code(404).send({ error: 'Report not found' });
      return reply.send(report);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load social media report' });
    }
  });
}
