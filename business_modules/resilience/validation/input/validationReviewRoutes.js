/**
 * HTTP routes for validation review queue (analyst-only).
 */
import { normalizeReportScope } from '../../domain/services/regionSignalFilter.js';
import { canViewAnalystDisplay } from '../../../../cross-cut-modules/auth/userAccess.js';

function requireAnalyst(request, reply) {
  if (!canViewAnalystDisplay(request.user?.email)) {
    reply.code(403).send({
      error: 'Forbidden',
      code: 'analyst_view_required',
      message: 'Analyst access required (config/userAccess.json level analyst or maintainer).',
    });
    return false;
  }
  return true;
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function validationReviewRoutes(app, opts) {
  const { validationReviewService, authPreHandler } = opts;
  if (!validationReviewService) {
    throw new Error('validationReviewService is required');
  }

  app.get('/api/validation/review-queue', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const date = String(request.query?.date ?? '').trim();
    const scope = normalizeReportScope(request.query?.scope ?? 'national');
    const status = request.query?.status ? String(request.query.status) : 'pending';
    if (!date) {
      return reply.code(400).send({ error: 'date query parameter is required' });
    }
    return reply.send(validationReviewService.listQueue(date, scope, { status }));
  });

  app.get('/api/validation/review-queue/:date/:scope/:articleKey', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const { date, scope: rawScope, articleKey } = request.params ?? {};
    const scope = normalizeReportScope(decodeURIComponent(String(rawScope)));
    const detail = validationReviewService.getItemDetail(
      decodeURIComponent(String(date)),
      scope,
      decodeURIComponent(String(articleKey)),
    );
    if (!detail) {
      return reply.code(404).send({ error: 'Queue item not found' });
    }
    return reply.send(detail);
  });

  app.post('/api/validation/review-queue/:date/:scope/:articleKey/decision', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const { date, scope: rawScope, articleKey } = request.params ?? {};
    const scope = normalizeReportScope(decodeURIComponent(String(rawScope)));
    const { action, payload } = request.body ?? {};
    try {
      const updated = validationReviewService.submitDecision(
        decodeURIComponent(String(date)),
        scope,
        decodeURIComponent(String(articleKey)),
        { email: request.user?.email },
        { action, payload },
      );
      if (!updated) {
        return reply.code(404).send({ error: 'Queue item not found' });
      }
      return reply.send({ ok: true, item: updated });
    } catch (err) {
      return reply.code(400).send({ error: err?.message ?? 'Failed to save decision' });
    }
  });
}
