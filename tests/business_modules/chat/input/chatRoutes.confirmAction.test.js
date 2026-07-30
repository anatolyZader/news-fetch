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
import { createSignalFlagStore } from '../../../../business_modules/chat/infrastructure/signalFlagStore.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const TEST_REPORTS_DIR = join(REPO_ROOT, 'business_modules/resilience_scorer/data/daily_reports');
const OPERATOR_REPORT_DATE = '2099-06-13';
const OPERATOR_REPORT_PATH = join(
  TEST_REPORTS_DIR,
  `resilience-report-data-${OPERATOR_REPORT_DATE}-run-1000.json`,
);

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
  let geoUpdateCalls;
  let signalFlagStore;

  beforeEach(async () => {
    prevAnalystEmails = process.env.RESILIENCE_ANALYST_EMAILS;
    process.env.RESILIENCE_ANALYST_EMAILS = 'analyst@test.com';
    geoUpdated = null;
    geoUpdateCalls = 0;
    dir = mkdtempSync(join(tmpdir(), 'chat-confirm-routes-'));
    chatStore = createChatStore(join(dir, 'chat.sqlite'));
    pendingActionStore = createChatPendingActionStore(join(dir, 'pending.sqlite'));
    signalFlagStore = createSignalFlagStore(join(dir, 'flags'));
    sessionId = chatStore.createSession({
      ownerUid: 'u1',
      reportDate: '2026-05-30',
      title: 'test',
    });

    app = Fastify();
    // executePendingAction only needs geo/operator-recommendation services — not pboReportReviewService.
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
      signalFlagStore,
      pboHistoricalSearchService: null,
      pboReportReviewService: null,
      geoUnknownReviewService: {
        updateStatus(id, update) {
          geoUpdateCalls += 1;
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
      toolName: 'propose_geo_unknown_update',
      params: { id: 7, status: 'resolved', note: 'mapped' },
      summary: 'geo #7 resolved',
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
    assert.match(res.json().result.message, /resolved/i);
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
    assert.equal(geoUpdateCalls, 1);
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

  it('confirms signal flag for non-analyst operator and writes the JSONL entry', async () => {
    const { id } = createPendingAction({
      toolName: 'propose_signal_flag',
      params: { source_ref: 'https://example.com/article', reason: 'not_a_signal', note: 'ad, not behavior' },
      summary: 'Flag signal https://example.com/article: not_a_signal',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/confirm-action',
      headers: { 'x-test-email': 'operator@test.com' },
      payload: { sessionId, actionId: id, confirmed: true },
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.json().result.message, /Signal flag recorded/);
    const day = new Date().toISOString().slice(0, 10);
    const flags = signalFlagStore.listForDate(day);
    assert.equal(flags.length, 1);
    assert.equal(flags[0].reason, 'not_a_signal');
    assert.equal(flags[0].user, 'operator@test.com');
    assert.equal(flags[0].session_id, sessionId);
  });
});
