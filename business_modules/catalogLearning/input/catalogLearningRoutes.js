/**
 * HTTP routes for catalog learning proposals (analyst-only).
 */
import { canViewAnalystDisplay } from '../../../cross-cut-modules/auth/userAccess.js';
import { auditFromRequest } from '../../../cross-cut-modules/security/input/auditLog.js';
import { costlyRoutePreHandlers } from '../../../cross-cut-modules/security/input/costlyRoutePreHandlers.js';

function requireAnalyst(request, reply) {
  if (!canViewAnalystDisplay(request.user?.email)) {
    reply.code(403).send({
      error: 'Forbidden',
      code: 'analyst_view_required',
    });
    return false;
  }
  return true;
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function catalogLearningRoutes(app, opts) {
  const { catalogProposalService, authPreHandler } = opts;
  if (!catalogProposalService) throw new Error('catalogProposalService is required');

  app.get('/api/catalog-learning/proposals', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const status = request.query?.status ? String(request.query.status) : 'draft';
    const limit = request.query?.limit ? Number(request.query.limit) : 20;
    const proposals = await catalogProposalService.listProposals({ status, limit });
    return reply.send({ proposals });
  });

  app.get('/api/catalog-learning/proposals/:id', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const proposal = catalogProposalService.getProposal(String(request.params.id));
    if (!proposal) return reply.code(404).send({ error: 'Not found' });
    return reply.send(proposal);
  });

  app.post('/api/catalog-learning/proposals/generate', costlyRoutePreHandlers(authPreHandler ? [authPreHandler] : []), async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    auditFromRequest(request, 'catalog.generate_proposals', '/api/catalog-learning/proposals/generate');
    const { maxDays, topN } = request.body ?? {};
    const result = await catalogProposalService.generateProposals({ maxDays, topN });
    return reply.send(result);
  });

  app.post('/api/catalog-learning/proposals/:id/review', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    auditFromRequest(request, 'catalog.review_proposal', '/api/catalog-learning/proposals/:id/review');
    const { status, note } = request.body ?? {};
    if (!status) return reply.code(400).send({ error: 'status required' });
    try {
      const updated = await catalogProposalService.reviewProposal(String(request.params.id), {
        status,
        note: note ?? '',
        reviewer: request.user?.email ?? '',
      });
      return reply.send(updated);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
