/**
 * Chat session, streaming, and confirm-action routes.
 */

import { getTodayInTimezone } from '../../utils/dateUtils.js';
import { streamChat } from '../../business_modules/chat/app/chatService.js';
import { generateChatTitle } from '../../business_modules/chat/infrastructure/claudeChat.js';
import { getCachedReport } from '../analysisService.js';
import { buildChatSystemHint } from './submissionHelpers.js';
import { requireMaintainerAccess } from '../../cross-cut-modules/auth/maintainerAccess.js';
import { canViewAnalystDisplay } from '../../cross-cut-modules/auth/userAccess.js';
import { auditFromRequest } from '../../cross-cut-modules/security/input/auditLog.js';
import { costlyRoutePreHandlers } from '../../cross-cut-modules/security/input/costlyRoutePreHandlers.js';
import { resolveDisplayView } from '../../business_modules/resilience/domain/services/assessmentDisplayTier.js';
import { executePendingAction } from '../../business_modules/chat/app/executePendingAction.js';

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
    sourceArchive,
    vectorIndexStore,
    retrievalService,
    pendingActionStore,
    validationReviewService,
    pboHistoricalSearchService,
    pboReportReviewService,
    driftService,
    catalogProposalService,
    geoUnknownReviewService,
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

  app.post('/api/chat/confirm-action', authHook, async (request, reply) => {
    const { sessionId, actionId, confirmed } = request.body ?? {};
    const uid = chatOwnerUid(request);
    const sid = String(sessionId ?? '').trim();
    const aid = String(actionId ?? '').trim();
    if (!sid || !aid) return reply.code(400).send({ error: 'sessionId and actionId required' });

    const session = chatStore.getSession(sid);
    if (!session || session.owner_uid !== uid) {
      return reply.code(404).send({ error: 'session not found' });
    }
    if (!pendingActionStore) {
      return reply.code(503).send({ error: 'Pending actions not configured' });
    }

    const pending = pendingActionStore.getPending(aid);
    if (!pending || pending.ownerUid !== uid || pending.sessionId !== sid) {
      return reply.code(404).send({ error: 'action not found' });
    }
    if (pending.consumedAt) {
      return reply.code(409).send({ error: 'action already consumed' });
    }
    if (pendingActionStore.isExpired(pending)) {
      pendingActionStore.markConsumed(aid);
      return reply.code(410).send({ error: 'action expired' });
    }

    if (!canViewAnalystDisplay(request.user?.email)) {
      return reply.code(403).send({ error: 'Analyst access required', code: 'analyst_view_required' });
    }

    pendingActionStore.markConsumed(aid);

    if (confirmed !== true) {
      auditFromRequest(request, 'chat.confirm_action_rejected', '/api/chat/confirm-action', { actionId: aid });
      return reply.send({ ok: true, rejected: true });
    }

    try {
      auditFromRequest(request, 'chat.confirm_action', '/api/chat/confirm-action', {
        actionId: aid,
        toolName: pending.toolName,
      });
      const result = await executePendingAction(pending, {
        userEmail: request.user?.email ?? '',
        validationReviewService,
        geoUnknownReviewService,
        catalogProposalService,
      });
      return reply.send({ ok: true, result });
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post('/api/chat', costlyRoutePreHandlers(authHook.preHandler ? [authHook.preHandler] : []), async (request, reply) => {
    if (process.env.CHAT_MAINTAINER_ONLY === 'true' && !requireMaintainerAccess(request, reply)) {
      return;
    }

    auditFromRequest(request, 'chat.post', '/api/chat');
    const { sessionId, message, action, scope, reportGeoScope, view, toolProfile } = request.body ?? {};

    const uid = chatOwnerUid(request);
    const sid = String(sessionId ?? '').trim();
    if (!sid) return reply.code(400).send({ error: 'sessionId required' });
    const session = chatStore.getSession(sid);
    if (!session || session.owner_uid !== uid) return reply.code(404).send({ error: 'session not found' });

    const existing = chatStore.listMessages({ sessionId: sid });
    const history = existing.map((m) => ({ role: m.role, content: m.content }));
    const systemHint = buildChatSystemHint(scope);

    const display_view = resolveDisplayView({
      queryView: view,
      userEmail: request.user?.email,
    });

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
    const geoScope = reportGeoScope === 'north' ? 'north' : 'national';

    await streamChat(
      userMessage,
      history,
      reply.raw,
      () => {
        const raw = getCachedReport(evidenceStore, { scope: geoScope });
        if (raw && typeof raw === 'object') {
          return { ...raw, display_view };
        }
        return raw;
      },
      {
        sourceArchive,
        evidenceStore,
        vectorIndexStore,
        retrievalService,
        systemHint,
        reportGeoScope: geoScope,
        userEmail: request.user?.email ?? '',
        ownerUid: uid,
        sessionId: sid,
        pendingActionStore,
        validationReviewService,
        pboHistoricalSearchService,
        pboReportReviewService,
        driftService,
        catalogProposalService,
        geoUnknownReviewService,
        toolProfile: String(toolProfile ?? 'default').trim() || 'default',
        onSend: (event) => {
          if (event?.type === 'text' && typeof event.text === 'string') assistantText += event.text;
        },
      },
    );
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
