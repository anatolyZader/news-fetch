/**
 * Fastify routes for homefront news ingest (pre-analysis markdown exports).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ newsSitesService?: ReturnType<import('../app/newsSitesService.js').createNewsSitesService>, authPreHandler?: any }} opts
 */
import { maybeLocalize } from '../../translation/index.js';
import { assertService, dateParam } from '../../../cross-cut-modules/security/app/httpGuards.js';

export async function newsSitesRoutes(app, opts) {
  const newsSitesService = opts?.newsSitesService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/news-sites', preHandler, async (_request, reply) => {
    if (!assertService(newsSitesService, reply, 'news sites service not configured')) return;
    try {
      return reply.send(newsSitesService.getDashboard());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load news dashboard' });
    }
  });

  app.get('/api/news-sites/daily', preHandler, async (request, reply) => {
    if (!assertService(newsSitesService, reply, 'news sites service not configured')) return;
    const date = dateParam(request.query?.date, reply);
    if (date === null) return;
    try {
      const feed = newsSitesService.getDailyFeed(date);
      if (!feed) return reply.code(404).send({ error: 'Daily news feed not found' });
      return reply.send(await maybeLocalize(feed, 'news.daily', request, { fingerprintExtra: date, costDate: date }));
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load daily news feed' });
    }
  });
}
