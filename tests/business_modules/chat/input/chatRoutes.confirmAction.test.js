import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chatRoutes } from '../../../../business_modules/chat/input/chatRoutes.js';
import { createChatStore } from '../../../../business_modules/chat/infrastructure/chatStore.js';
import { createChatPendingActionStore } from '../../../../business_modules/chat/infrastructure/chatPendingActionStore.js';

describe('chatRoutes confirm-action', () => {
  let dir;
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let chatStore;
  let pendingActionStore;
  let sessionId;
  let prevAnalystEmails;

  beforeEach(async () => {
    prevAnalystEmails = process.env.RESILIENCE_ANALYST_EMAILS;
    process.env.RESILIENCE_ANALYST_EMAILS = 'analyst@test.com';
    dir = mkdtempSync(join(tmpdir(), 'chat-confirm-routes-'));
    chatStore = createChatStore(join(dir, 'chat.sqlite'));
    pendingActionStore = createChatPendingActionStore(join(dir, 'pending.sqlite'));
    sessionId = chatStore.createSession({
      ownerUid: 'u1',
      reportDate: '2026-05-30',
      title: 'test',
    });

    app = Fastify();
    const authPreHandler = async (request) => {
      request.user = {
        uid: 'u1',
        email: request.headers['x-test-email'] ?? 'analyst@test.com',
      };
    };
    await chatRoutes(app, {
      authHook: { preHandler: authPreHandler },
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
          return { date, scope, article_key: key, action, reviewer: reviewer.email };
        },
      },
      pboHistoricalSearchService: null,
      pboReportReviewService: null,
      driftService: null,
      catalogProposalService: null,
      geoUnknownReviewService: null,
    });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    if (prevAnalystEmails === undefined) delete process.env.RESILIENCE_ANALYST_EMAILS;
    else process.env.RESILIENCE_ANALYST_EMAILS = prevAnalystEmails;
  });

  function createPendingAction() {
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
});
