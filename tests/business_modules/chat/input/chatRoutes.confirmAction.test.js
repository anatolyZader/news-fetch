import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chatRoutes } from '../../../../business_modules/chat/input/chatRoutes.js';
import { createChatStore } from '../../../../business_modules/chat/infrastructure/chatStore.js';
import { createChatPendingActionStore } from '../../../../business_modules/chat/infrastructure/chatPendingActionStore.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const TEST_REPORTS_DIR = join(REPO_ROOT, 'daily_reports');
const OPERATOR_REPORT_DATE = '2099-06-13';
const OPERATOR_REPORT_PATH = join(TEST_REPORTS_DIR, `resilience-report-${OPERATOR_REPORT_DATE}.json`);

async function testAuthPreHandler(request) {
  request.user = {
    uid: 'u1',
    email: request.headers['x-test-email'] ?? 'analyst@test.com',
  };
}

describe('chatRoutes confirm-action', () => {
  let dir;
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let chatStore;
  let pendingActionStore;
  let sessionId;
  let prevAnalystEmails;
  let geoUpdated;
  let catalogReviewed;
  let submitDecisionCalls;

  beforeEach(async () => {
    prevAnalystEmails = process.env.RESILIENCE_ANALYST_EMAILS;
    process.env.RESILIENCE_ANALYST_EMAILS = 'analyst@test.com';
    geoUpdated = null;
    catalogReviewed = null;
    submitDecisionCalls = 0;
    dir = mkdtempSync(join(tmpdir(), 'chat-confirm-routes-'));
    chatStore = createChatStore(join(dir, 'chat.sqlite'));
    pendingActionStore = createChatPendingActionStore(join(dir, 'pending.sqlite'));
    sessionId = chatStore.createSession({
      ownerUid: 'u1',
      reportDate: '2026-05-30',
      title: 'test',
    });

    app = Fastify();
    // executePendingAction only needs validation/geo/catalog services — not pboReportReviewService or driftService.
    await chatRoutes(app, {
      authHook: { preHandler: testAuthPreHandler },
      chatStore,
      chatOwnerUid: (request) => request.user?.uid ?? '',
      timezone: 'Asia/Jerusalem',
      evidenceStore: null,
      sourceArchive: null,
      vectorIndexStore: null,
      retrievalService: null,
      pendingActionStore,
      validationReviewService: {
        submitDecision(date, scope, key, reviewer, { action }) {
          submitDecisionCalls += 1;
          return { date, scope, article_key: key, action, reviewer: reviewer.email };
        },
      },
      pboHistoricalSearchService: null,
      pboReportReviewService: null,
      driftService: null,
      catalogProposalService: {
        async reviewProposal(proposalId, review) {
          catalogReviewed = { proposalId, review };
        },
      },
      geoUnknownReviewService: {
        updateStatus(id, update) {
          geoUpdated = { id, update };
        },
      },
    });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    if (existsSync(OPERATOR_REPORT_PATH)) rmSync(OPERATOR_REPORT_PATH);
    if (prevAnalystEmails === undefined) delete process.env.RESILIENCE_ANALYST_EMAILS;
    else process.env.RESILIENCE_ANALYST_EMAILS = prevAnalystEmails;
  });

  function createPendingAction(overrides = {}) {
    return pendingActionStore.createPending({
      ownerUid: 'u1',
      sessionId,
      toolName: 'propose_validation_decision',
      params: {
        date: '2026-05-30',
        scope: 'national',
        article_key: 'url:https://example.com/x',
        action: 'skip',
      },
      summary: 'skip item',
      ...overrides,
    });
  }

  it('confirms pending action for analyst', async () => {
    const { id } = createPendingAction();
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      headers: { 'x-test-email': 'analyst@test.com' },
      payload: { sessionId, actionId: id, confirmed: true },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().ok, true);
    assert.match(res.json().result.message, /skip/i);
  });

  it('prevents double execution on double confirm', async () => {
    const { id } = createPendingAction();

    const [resA, resB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/chat/confirm-action',
        headers: { 'x-test-email': 'analyst@test.com' },
        payload: { sessionId, actionId: id, confirmed: true },
      }),
      app.inject({
        method: 'POST',
        url: '/api/chat/confirm-action',
        headers: { 'x-test-email': 'analyst@test.com' },
        payload: { sessionId, actionId: id, confirmed: true },
      }),
    ]);

    const codes = [resA.statusCode, resB.statusCode].sort();
    assert.equal(codes[0], 200);
    assert.equal(codes[1], 409);
    assert.equal(submitDecisionCalls, 1);
  });

  it('rejects without executing', async () => {
    const { id } = createPendingAction();
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      payload: { sessionId, actionId: id, confirmed: false },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().rejected, true);
  });

  it('returns 403 for non-analyst', async () => {
    const { id } = createPendingAction();
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      headers: { 'x-test-email': 'operator@test.com' },
      payload: { sessionId, actionId: id, confirmed: true },
    });
    assert.equal(res.statusCode, 403);
  });

  it('returns 404 for unknown action', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      payload: { sessionId, actionId: 'missing-id', confirmed: true },
    });
    assert.equal(res.statusCode, 404);
  });

  it('returns 410 for expired action', async () => {
    const pendingDbPath = join(dir, 'pending.sqlite');
    const { id } = createPendingAction();
    const db = new DatabaseSync(pendingDbPath);
    db.prepare('UPDATE chat_pending_actions SET expires_at = ? WHERE id = ?').run(
      new Date(Date.now() - 60_000).toISOString(),
      id,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      payload: { sessionId, actionId: id, confirmed: true },
    });
    assert.equal(res.statusCode, 410);
  });

  it('confirms geo unknown update for analyst', async () => {
    const { id } = createPendingAction({
      toolName: 'propose_geo_unknown_update',
      params: { id: 42, status: 'resolved', note: 'mapped' },
      summary: 'geo #42 resolved',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      headers: { 'x-test-email': 'analyst@test.com' },
      payload: { sessionId, actionId: id, confirmed: true },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(geoUpdated?.id, 42);
    assert.equal(geoUpdated?.update.status, 'resolved');
  });

  it('confirms catalog proposal review for analyst', async () => {
    const { id } = createPendingAction({
      toolName: 'propose_catalog_proposal_review',
      params: { proposal_id: 'prop-1', status: 'approved', note: 'ok' },
      summary: 'catalog prop-1 approved',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      headers: { 'x-test-email': 'analyst@test.com' },
      payload: { sessionId, actionId: id, confirmed: true },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(catalogReviewed?.proposalId, 'prop-1');
    assert.equal(catalogReviewed?.review.status, 'approved');
  });

  it('confirms operator recommendation for non-analyst operator', async () => {
    mkdirSync(TEST_REPORTS_DIR, { recursive: true });
    writeFileSync(OPERATOR_REPORT_PATH, JSON.stringify({
      assessment: {
        date: OPERATOR_REPORT_DATE,
        operator_recommendations: [{
          id: 'rec-test-1',
          status: 'pending',
          pattern_code: 'test_pattern',
          level: 'watch',
        }],
      },
    }), 'utf8');

    const { id } = createPendingAction({
      toolName: 'propose_operator_recommendation',
      params: {
        date: OPERATOR_REPORT_DATE,
        scope: 'national',
        recommendation_id: 'rec-test-1',
        action: 'acknowledge',
      },
      summary: 'ack rec-test-1',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      headers: { 'x-test-email': 'operator@test.com' },
      payload: { sessionId, actionId: id, confirmed: true },
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.json().result.message, /acknowledge/i);
  });
});
