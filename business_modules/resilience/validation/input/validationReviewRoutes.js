/**
 * HTTP routes for validation review queue (analyst-only).
 */
import { normalizeReportScope } from '../../domain/services/regionSignalFilter.js';
import { canViewAnalystDisplay } from '../../../../cross-cut-modules/auth/userAccess.js';
import { auditFromRequest } from '../../../../cross-cut-modules/security/input/auditLog.js';

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

import { runValidationAgent } from '../app/validationReviewAgent.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function validationReviewRoutes(app, opts) {
  const { validationReviewService, authPreHandler, retrievalService } = opts;
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

  app.get('/api/validation/review-queue/:date/:scope/:articleKey/context', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const { date, scope: rawScope, articleKey } = request.params ?? {};
    const scope = normalizeReportScope(decodeURIComponent(String(rawScope)));
    const ctx = await validationReviewService.getItemContext(
      decodeURIComponent(String(date)),
      scope,
      decodeURIComponent(String(articleKey)),
    );
    if (!ctx) {
      return reply.code(404).send({ error: 'Queue item not found' });
    }
    return reply.send(ctx);
  });

  app.post('/api/validation/review-queue/:date/:scope/:articleKey/explain', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const { date, scope: rawScope, articleKey } = request.params ?? {};
    const scope = normalizeReportScope(decodeURIComponent(String(rawScope)));
    const question = String(request.body?.question ?? '').trim()
      || 'Why was this article flagged for review?';
    try {
      const result = await validationReviewService.explainItem(
        decodeURIComponent(String(date)),
        scope,
        decodeURIComponent(String(articleKey)),
        question,
      );
      if (!result) {
        return reply.code(404).send({ error: 'Queue item not found' });
      }
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'Explain failed' });
    }
  });

  app.post('/api/validation/review-queue/:date/:scope/:articleKey/agent', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const { date, scope: rawScope, articleKey } = request.params ?? {};
    const scope = normalizeReportScope(decodeURIComponent(String(rawScope)));
    const messages = Array.isArray(request.body?.messages) ? request.body.messages : [];
    auditFromRequest(request, 'validation.agent', request.url);
    try {
      const result = await runValidationAgent({
        validationReviewService,
        retrievalService,
        date: decodeURIComponent(String(date)),
        scope,
        articleKey: decodeURIComponent(String(articleKey)),
        messages,
      });
      if (result.error && !result.item) {
        return reply.code(result.error.includes('not found') ? 404 : 503).send({ error: result.error });
      }
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'Agent failed' });
    }
  });

  app.post('/api/validation/review-queue/:date/:scope/:articleKey/decision', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const { date, scope: rawScope, articleKey } = request.params ?? {};
    const scope = normalizeReportScope(decodeURIComponent(String(rawScope)));
    const { action, payload } = request.body ?? {};
    try {
      auditFromRequest(request, 'validation.decision', request.url, { action });
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
