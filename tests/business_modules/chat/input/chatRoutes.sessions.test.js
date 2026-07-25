import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chatRoutes } from '../../../../business_modules/chat/input/chatRoutes.js';
import { createChatStore } from '../../../../business_modules/chat/infrastructure/chatStore.js';

async function testAuthPreHandler(request) {
  request.user = { uid: request.headers['x-test-uid'] ?? 'u1', email: 'operator@test.com' };
}

describe('chatRoutes session delete', () => {
  let dir;
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let chatStore;
  let sessionId;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'chat-session-routes-'));
    chatStore = createChatStore(join(dir, 'chat.sqlite'));
    sessionId = chatStore.createSession({ ownerUid: 'u1', reportDate: '2026-05-30', title: 'to delete' });
    chatStore.addMessage({ sessionId, role: 'user', content: 'hello', meta: null });

    app = Fastify();
    await chatRoutes(app, {
      authHook: { preHandler: testAuthPreHandler },
      chatStore,
      chatOwnerUid: (request) => request.user?.uid ?? '',
      timezone: 'Asia/Jerusalem',
      evidenceStore: null,
      sourceArchive: null,
      vectorIndexStore: null,
      retrievalService: null,
      pendingActionStore: null,
      pboHistoricalSearchService: null,
      pboReportReviewService: null,
      geoUnknownReviewService: null,
    });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('deletes a session on a bodyless DELETE without Content-Type', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/chat/sessions/${sessionId}` });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).ok, true);

    const list = await app.inject({ method: 'GET', url: '/api/chat/sessions?date=all' });
    const sessions = JSON.parse(list.body).sessions;
    assert.ok(!sessions.some((s) => s.id === sessionId), 'deleted session must not be listed');
  });

  it('rejects a bodyless DELETE that declares application/json (why the client must not send it)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/chat/sessions/${sessionId}`,
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /FST_ERR_CTP_EMPTY_JSON_BODY/);
  });

  it('does not delete another owner\'s session', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/chat/sessions/${sessionId}`,
      headers: { 'x-test-uid': 'intruder' },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).ok, false);
    assert.ok(chatStore.getSession(sessionId), 'session must survive');
  });
});
