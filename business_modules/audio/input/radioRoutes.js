/**
 * Fastify routes for radio/audio ingest (pre-analysis transcript markdown).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ radioIngestReadService?: ReturnType<import('../app/radioIngestReadService.js').createRadioIngestReadService>, authPreHandler?: any }} opts
 */
import { checkOptionalDistrictQueryAccess } from '../../../cross-cut-modules/auth/checkOptionalDistrictQueryAccess.js';
import { assertService, dateParam } from '../../../cross-cut-modules/security/app/httpGuards.js';

export async function radioRoutes(app, opts) {
  const radioIngestReadService = opts?.radioIngestReadService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/radio', preHandler, async (request, reply) => {
    if (!assertService(radioIngestReadService, reply, 'radio ingest service not configured')) return;
    if (!checkOptionalDistrictQueryAccess(request, reply)) return;
    try {
      return reply.send(radioIngestReadService.getDashboard());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load radio dashboard' });
    }
  });

  app.get('/api/radio/daily', preHandler, async (request, reply) => {
    if (!assertService(radioIngestReadService, reply, 'radio ingest service not configured')) return;
    if (!checkOptionalDistrictQueryAccess(request, reply)) return;
    const date = dateParam(request.query?.date, reply);
    if (date === null) return;
    try {
      const feed = radioIngestReadService.getDailyFeed(date);
      if (!feed) return reply.code(404).send({ error: 'Daily radio feed not found' });
      return reply.send(feed);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load daily radio feed' });
    }
  });
}
