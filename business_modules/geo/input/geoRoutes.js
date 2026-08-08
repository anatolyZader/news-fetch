/**
 * Internal Fastify routes for geo resolution (auth when app uses authHook).
 */
import { requireDeveloperView } from '../../../cross-cut-modules/auth/requireDeveloperAccess.js';
import { auditFromRequest } from '../../../cross-cut-modules/security/input/auditLog.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ authPreHandler?: import('fastify').preHandlerHookHandler, geoUnknownReviewService?: object }} [opts]
 */
export async function registerGeoRoutes(app, opts = {}) {
  const pre = opts.authPreHandler ? { preHandler: opts.authPreHandler } : {};
  const geoUnknownReviewService = opts.geoUnknownReviewService ?? null;

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

  app.get('/api/geo/unknown-queue', pre, async (request, reply) => {
    if (!requireDeveloperView(request, reply)) return;
    if (!geoUnknownReviewService?.list) {
      return reply.code(503).send({ error: 'Geo unknown review not configured' });
    }
    const status = request.query?.status ? String(request.query.status) : 'new';
    const limit = request.query?.limit ? Number(request.query.limit) : 20;
    return reply.send({ items: geoUnknownReviewService.list({ status, limit }) });
  });

  app.post('/api/geo/unknown-queue/:id/status', pre, async (request, reply) => {
    if (!requireDeveloperView(request, reply)) return;
    if (!geoUnknownReviewService?.updateStatus) {
      return reply.code(503).send({ error: 'Geo unknown review not configured' });
    }
    const id = Number.parseInt(String(request.params.id), 10);
    const { status, note } = request.body ?? {};
    if (!status) return reply.code(400).send({ error: 'status required' });
    auditFromRequest(request, 'geo.unknown_update', request.url, { status });
    try {
      const result = geoUnknownReviewService.updateStatus(id, {
        status,
        reviewerNote: note ?? '',
        reviewer: request.user?.email ?? '',
      });
      return reply.send(result);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
