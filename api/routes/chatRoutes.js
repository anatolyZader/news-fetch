/**
 * Chat session and streaming routes.
 */

import { getTodayInTimezone } from '../../utils/dateUtils.js';
import { streamChat } from '../../business_modules/chat/app/chatService.js';
import { generateChatTitle } from '../../business_modules/chat/infrastructure/claudeChat.js';
import { getCachedReport } from '../analysisService.js';
import { buildChatSystemHint } from './submissionHelpers.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function chatRoutes(app, opts) {
  const {
    authHook,
    chatStore,
    chatOwnerUid,
    timezone,
    evidenceStore,
    vectorIndexStore,
  } = opts;

  app.get('/api/chat/sessions', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const dateParam = request.query?.date == null ? '' : String(request.query.date).trim();
    const reportDate = dateParam || getTodayInTimezone(timezone);
    return reply.send({ sessions: chatStore.listSessions({ ownerUid: uid, reportDate }) });
  });

  app.post('/api/chat/sessions', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const { date, title } = request.body ?? {};
    const reportDate = String(date ?? '').trim() || getTodayInTimezone(timezone);
    const id = chatStore.createSession({ ownerUid: uid, reportDate, title });
    return reply.code(201).send({ id });
  });

  app.put('/api/chat/sessions/:id', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const sessionId = String(request.params?.id ?? '').trim();
    const { title } = request.body ?? {};
    if (!sessionId) return reply.code(400).send({ error: 'session id required' });
    const ok = chatStore.renameSession({ ownerUid: uid, sessionId, title });
    return reply.send({ ok });
  });

  app.delete('/api/chat/sessions/:id', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const sessionId = String(request.params?.id ?? '').trim();
    if (!sessionId) return reply.code(400).send({ error: 'session id required' });
    const ok = chatStore.deleteSession({ ownerUid: uid, sessionId });
    return reply.send({ ok });
  });

  app.get('/api/chat/sessions/:id/messages', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const sessionId = String(request.params?.id ?? '').trim();
    const session = chatStore.getSession(sessionId);
    if (!session || session.owner_uid !== uid) return reply.code(404).send({ error: 'not found' });
    return reply.send({ messages: chatStore.listMessages({ sessionId }) });
  });

  app.delete('/api/chat/sessions/:id/messages/:messageId', authHook, async (request, reply) => {
    const uid = chatOwnerUid(request);
    const sessionId = String(request.params?.id ?? '').trim();
    const messageId = String(request.params?.messageId ?? '').trim();
    const session = chatStore.getSession(sessionId);
    if (!session || session.owner_uid !== uid) return reply.code(404).send({ error: 'not found' });
    const ok = chatStore.hideMessage({ sessionId, messageId });
    return reply.send({ ok });
  });

  app.post('/api/chat', authHook, async (request, reply) => {
    const { sessionId, message, action, scope } = request.body ?? {};

    const uid = chatOwnerUid(request);
    const sid = String(sessionId ?? '').trim();
    if (!sid) return reply.code(400).send({ error: 'sessionId required' });
    const session = chatStore.getSession(sid);
    if (!session || session.owner_uid !== uid) return reply.code(404).send({ error: 'session not found' });

    const existing = chatStore.listMessages({ sessionId: sid });
    const history = existing.map((m) => ({ role: m.role, content: m.content }));
    const systemHint = buildChatSystemHint(scope);

    const act = String(action ?? 'send');
    let userMessage = String(message ?? '').trim();
    const shouldPersistUser =
      act === 'send' || act === 'continue' || act === 'edit_resend';

    if (act === 'regenerate') {
      const lastUser = [...existing].reverse().find((m) => m.role === 'user');
      userMessage = String(lastUser?.content ?? '').trim();
    }

    if (!userMessage) return reply.code(400).send({ error: 'message required' });

    if (shouldPersistUser) {
      chatStore.addMessage({ sessionId: sid, role: 'user', content: userMessage, meta: { action: act } });
      chatStore.touchSession({ ownerUid: uid, sessionId: sid });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let assistantText = '';
    await streamChat(userMessage, history, reply.raw, getCachedReport, {
      evidenceStore,
      vectorIndexStore,
      systemHint,
      onSend: (event) => {
        if (event?.type === 'text' && typeof event.text === 'string') assistantText += event.text;
      },
    });
    if (assistantText) {
      chatStore.addMessage({ sessionId: sid, role: 'assistant', content: assistantText, meta: null });
      chatStore.touchSession({ ownerUid: uid, sessionId: sid });
    }

    try {
      const current = chatStore.getSession(sid);
      if (current && current.owner_uid === uid && !String(current.title ?? '').trim()) {
        const seed = chatStore.getFirstUserMessage({ sessionId: sid }) ?? userMessage;
        const title = await generateChatTitle(seed);
        if (title) chatStore.renameSession({ ownerUid: uid, sessionId: sid, title });
      }
    } catch {
      // Ignore title generation failures; chat still works.
    }
    reply.raw.end();
  });
}
