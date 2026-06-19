/**
 * Fastify routes for professional squad visit dashboards.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ visitsService: ReturnType<import('../app/visitsService.js').createVisitsService>, authPreHandler?: any }} opts
 */
import { checkOptionalDistrictQueryAccess } from '../../../cross-cut-modules/auth/checkOptionalDistrictQueryAccess.js';
import { maybeLocalize } from '../../translation/index.js';

export async function visitsRoutes(app, opts) {
  const visitsService = opts?.visitsService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/visits', preHandler, async (request, reply) => {
    if (!visitsService) {
      return reply.code(503).send({ error: 'visits service not configured' });
    }
    if (!checkOptionalDistrictQueryAccess(request, reply)) return;

    try {
      const data = visitsService.getDashboard();
      return reply.send(await maybeLocalize(data, 'visits.list', request));
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load visits data' });
    }
  });
}
