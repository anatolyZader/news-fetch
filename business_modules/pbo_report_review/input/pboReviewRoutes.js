/**
 * HTTP routes for municipal PBO completeness reviews.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { maybeLocalize } from '../../translation/index.js';

function verifyResendWebhook(rawBody, signature, secret) {
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const sig = String(signature ?? '').replace(/^sha256=/, '');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 * @param {ReturnType<import('../app/pboReportReviewService.js').createPboReportReviewService>} opts.pboReportReviewService
 * @param {import('fastify').preHandlerHookHandler} [opts.authPreHandler]
 */
export async function pboReviewRoutes(app, opts) {
  const { pboReportReviewService, pboHistoricalSearchService, authPreHandler } = opts;
  if (!pboReportReviewService) {
    throw new Error('pboReportReviewService is required');
  }

  if (pboHistoricalSearchService) {
    app.get('/api/pbo/historical-search', {
      preHandler: authPreHandler,
    }, async (request, reply) => {
      const query = String(request.query?.query ?? '').trim();
      if (!query) {
        return reply.code(400).send({ error: 'query parameter is required' });
      }
      const result = await pboHistoricalSearchService.search({
        query,
        date: request.query?.date,
        district: request.query?.district,
        municipality: request.query?.municipality,
        region: request.query?.region,
        days: request.query?.days ? Number(request.query.days) : undefined,
        limit: request.query?.limit ? Number(request.query.limit) : undefined,
      });
      return reply.send(await maybeLocalize(result, 'pbo.historicalSearch', request, { fingerprintExtra: query }));
    });
  }

  app.get('/api/pbo/municipal-reviews', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    const date = String(request.query?.date ?? '').trim();
    if (!date) {
      return reply.code(400).send({ error: 'date query parameter is required' });
    }
    const reviews = await pboReportReviewService.listReviewsForDate(date);
    return reply.send(await maybeLocalize({ date, reviews }, 'pbo.municipalReview', request, { fingerprintExtra: date }));
  });

  app.get('/api/pbo/municipal-reviews/:date/:municipality', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    const { date, municipality } = request.params ?? {};
    const detail = await pboReportReviewService.getReviewDetail(
      decodeURIComponent(String(date)),
      decodeURIComponent(String(municipality)),
    );
    if (!detail) {
      return reply.code(404).send({ error: 'Review not found' });
    }
    return reply.send(await maybeLocalize(detail, 'pbo.municipalReview', request, {
      fingerprintExtra: `${date}-${municipality}`,
    }));
  });

  app.post('/api/pbo/municipal-reviews/:date/:municipality/replies', {
    preHandler: authPreHandler,
  }, async (request, reply) => {
    const { date, municipality } = request.params ?? {};
    const { answers } = request.body ?? {};
    if (!Array.isArray(answers)) {
      return reply.code(400).send({ error: 'answers array is required' });
    }
    try {
      const updated = await pboReportReviewService.submitWebReply(
        decodeURIComponent(String(date)),
        decodeURIComponent(String(municipality)),
        answers,
      );
      return reply.send({ ok: true, review: updated });
    } catch (err) {
      return reply.code(400).send({ error: err?.message ?? 'Failed to save reply' });
    }
  });

  app.post('/api/pbo/review/inbound-email', async (request, reply) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    const rawBody = request.rawBody ?? JSON.stringify(request.body ?? {});
    const signature = request.headers['svix-signature']
      ?? request.headers['resend-signature']
      ?? request.headers['x-resend-signature'];

    if (secret && signature) {
      if (!verifyResendWebhook(rawBody, signature, secret)) {
        return reply.code(401).send({ error: 'invalid webhook signature' });
      }
    } else if (secret && !signature) {
      return reply.code(401).send({ error: 'missing webhook signature' });
    }

    try {
      const updated = await pboReportReviewService.handleInboundEmail(request.body);
      return reply.send({ ok: true, review: updated });
    } catch (err) {
      return reply.code(400).send({ error: err?.message ?? 'Inbound email rejected' });
    }
  });
}
