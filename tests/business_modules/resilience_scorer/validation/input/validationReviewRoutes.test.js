import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validationReviewRoutes } from '../../../../../business_modules/resilience_scorer/analyst/validation/input/validationReviewRoutes.js';
import { createValidationReviewSqliteStore } from '../../../../../business_modules/resilience_scorer/analyst/validation/infrastructure/adapters/validationReviewSqliteStore.js';
import { createValidationReviewService } from '../../../../../business_modules/resilience_scorer/analyst/validation/app/validationReviewService.js';

describe('validationReviewRoutes', () => {
  let dir;
  let dbPath;
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let prevAnalystEmails;

  beforeEach(async () => {
    prevAnalystEmails = process.env.RESILIENCE_ANALYST_EMAILS;
    process.env.RESILIENCE_ANALYST_EMAILS = 'analyst@test.com';
    dir = mkdtempSync(join(tmpdir(), 'validation-review-routes-'));
    dbPath = join(dir, 'test.sqlite');
    const store = createValidationReviewSqliteStore(dbPath);
    store.upsertQueueItems('2026-05-28', 'national', [
      {
        article_key: 'url:https://example.com/x',
        queue_rank: 1,
        priority: 10,
        review_status: 'pending',
        article_url: 'https://example.com/x',
        reasons: [{ code: 'oov_suggested' }],
        signals: [{ evidence: 'sample' }],
        signal_types: ['unknown_type'],
        component_ids: ['narrative'],
      },
    ]);
    const validationReviewService = createValidationReviewService({ store });
    app = Fastify();
    await validationReviewRoutes(app, {
      validationReviewService,
      authPreHandler: async (request) => {
        request.user = { uid: 'a1', email: request.headers['x-test-email'] ?? 'analyst@test.com' };
      },
    });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    if (prevAnalystEmails === undefined) delete process.env.RESILIENCE_ANALYST_EMAILS;
    else process.env.RESILIENCE_ANALYST_EMAILS = prevAnalystEmails;
  });

  it('returns 403 for non-analyst users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/validation/review-queue?date=2026-05-28',
      headers: { 'x-test-email': 'operator@test.com' },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'analyst_view_required');
  });

  it('lists pending items for analyst', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/validation/review-queue?date=2026-05-28&status=pending',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().item_count, 1);
  });

  it('POST decision marks item skipped', async () => {
    const key = encodeURIComponent('url:https://example.com/x');
    const res = await app.inject({
      method: 'POST',
      url: `/api/validation/review-queue/2026-05-28/national/${key}/decision`,
      payload: { action: 'skip' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().item.review_status, 'skipped');
  });

  it('GET context returns item and rag shape for analyst', async () => {
    const key = encodeURIComponent('url:https://example.com/x');
    const res = await app.inject({
      method: 'GET',
      url: `/api/validation/review-queue/2026-05-28/national/${key}/context`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.item);
    assert.ok(body.rag);
    assert.ok(Array.isArray(body.rag.similar_articles));
    assert.ok(Array.isArray(body.rag.prior_decisions));
    assert.ok(Array.isArray(body.rag.article_chunks));
  });
});
