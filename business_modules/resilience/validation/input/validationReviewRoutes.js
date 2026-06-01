/**
 * HTTP routes for validation review queue (analyst-only).
 */
import { normalizeReportScope } from '../../domain/services/regionSignalFilter.js';
import { requireAnalystView } from '../../../../cross-cut-modules/auth/requireAnalystAccess.js';
import { auditFromRequest } from '../../../../cross-cut-modules/security/input/auditLog.js';
import { costlyRoutePreHandlers } from '../../../../cross-cut-modules/security/input/costlyRoutePreHandlers.js';
import { normalizeAuthPreHandlers } from '../../../../cross-cut-modules/auth/buildAuthHooks.js';
import { createHttpCostRecorder } from '../../../../cross-cut-modules/budget/index.js';
import {
  requireValidationLlmAccess,
  recordValidationLlmUsage,
  VALIDATION_LLM_CHANNELS,
} from '../../../../cross-cut-modules/budget/app/validationLlmAccess.js';
import { runValidationAgent } from '../app/validationReviewAgent.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function validationReviewRoutes(app, opts) {
  const {
    validationReviewService,
    authPreHandler,
    retrievalService,
    llmQuotaStore = null,
  } = opts;
  if (!validationReviewService) {
    throw new Error('validationReviewService is required');
  }

  const authHooks = normalizeAuthPreHandlers(authPreHandler);
  const costlyRoute = costlyRoutePreHandlers(authHooks);
  const authOnly = authHooks.length ? { preHandler: authHooks } : {};

  app.get('/api/validation/review-queue', authOnly, async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
    const date = String(request.query?.date ?? '').trim();
    const scope = normalizeReportScope(request.query?.scope ?? 'national');
    const status = request.query?.status ? String(request.query.status) : 'pending';
    if (!date) {
      return reply.code(400).send({ error: 'date query parameter is required' });
    }
    return reply.send(validationReviewService.listQueue(date, scope, { status }));
  });

  app.get('/api/validation/review-queue/:date/:scope/:articleKey', authOnly, async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
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

  app.get('/api/validation/review-queue/:date/:scope/:articleKey/context', authOnly, async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
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

  app.post('/api/validation/review-queue/:date/:scope/:articleKey/explain', costlyRoute, async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
    if (!requireValidationLlmAccess(request, reply, llmQuotaStore, VALIDATION_LLM_CHANNELS.explain)) {
      return;
    }
    const { date, scope: rawScope, articleKey } = request.params ?? {};
    const scope = normalizeReportScope(decodeURIComponent(String(rawScope)));
    const question = String(request.body?.question ?? '').trim()
      || 'Why was this article flagged for review?';
    const costRecorder = createHttpCostRecorder({
      script: 'http:validation-explain',
      ownerUid: request.user?.uid ?? '',
      route: request.url,
    });
    try {
      const result = await validationReviewService.explainItem(
        decodeURIComponent(String(date)),
        scope,
        decodeURIComponent(String(articleKey)),
        question,
        {
          onUsage: (p) => costRecorder.onUsage(p),
        },
      );
      if (!result) {
        return reply.code(404).send({ error: 'Queue item not found' });
      }
      recordValidationLlmUsage(request, llmQuotaStore, VALIDATION_LLM_CHANNELS.explain);
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'Explain failed' });
    } finally {
      costRecorder.flush();
    }
  });

  app.post('/api/validation/review-queue/:date/:scope/:articleKey/agent', costlyRoute, async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
    if (!requireValidationLlmAccess(request, reply, llmQuotaStore, VALIDATION_LLM_CHANNELS.agent)) {
      return;
    }
    const { date, scope: rawScope, articleKey } = request.params ?? {};
    const scope = normalizeReportScope(decodeURIComponent(String(rawScope)));
    const messages = Array.isArray(request.body?.messages) ? request.body.messages : [];
    auditFromRequest(request, 'validation.agent', request.url);
    const costRecorder = createHttpCostRecorder({
      script: 'http:validation-agent',
      ownerUid: request.user?.uid ?? '',
      route: request.url,
    });
    try {
      const result = await runValidationAgent({
        validationReviewService,
        retrievalService,
        date: decodeURIComponent(String(date)),
        scope,
        articleKey: decodeURIComponent(String(articleKey)),
        messages,
        onUsage: (p) => costRecorder.onUsage(p),
      });
      if (result.error && !result.item) {
        return reply.code(result.error.includes('not found') ? 404 : 503).send({ error: result.error });
      }
      recordValidationLlmUsage(request, llmQuotaStore, VALIDATION_LLM_CHANNELS.agent);
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'Agent failed' });
    } finally {
      costRecorder.flush();
    }
  });

  app.post('/api/validation/review-queue/:date/:scope/:articleKey/decision', authOnly, async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
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
