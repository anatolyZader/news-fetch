/**
 * Chat session, streaming, and confirm-action routes.
 */

import { getTodayInTimezone } from '../../../utils/dateUtils.js';
import { streamChat } from '../app/chatService.js';
import { createChatSessionService } from '../app/chatSessionService.js';
import { requireMaintainerAccess } from '../../../cross-cut-modules/auth/maintainerAccess.js';
import { canViewAnalystDisplay } from '../../../cross-cut-modules/auth/userAccess.js';
import { auditFromRequest } from '../../../cross-cut-modules/security/input/auditLog.js';
import { costlyRoutePreHandlers } from '../../../cross-cut-modules/security/input/costlyRoutePreHandlers.js';
import { authPreHandlerList } from '../../../cross-cut-modules/auth/buildAuthHooks.js';
import { createHttpCostRecorder } from '../../../cross-cut-modules/budget/index.js';
import { createChatRetrievalCache } from '../../../cross-cut-modules/retrieval/chatRetrievalCache.js';
import { executePendingAction } from '../app/executePendingAction.js';
import { OPERATOR_PROPOSE_TOOL_NAMES } from '../domain/chatConfig.js';
import { METRIC } from '../../../cross-cut-modules/monitoring/domain/metricNames.js';

function chatRequestTimeoutMs() {
  const n = Number.parseInt(process.env.CHAT_REQUEST_TIMEOUT_MS ?? '270000', 10);
  return Number.isFinite(n) && n > 0 ? n : 270_000;
}

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
    llmPort,
    tracePort,
    reportReadPort,
    reportDisplayPort,
    agentKernel,
    chatLlmPort,
  } = opts;

  const chatSessionService = createChatSessionService({
    chatStore,
    chatLlmPort,
    timezone,
    canViewAnalyst: canViewAnalystDisplay,
  });

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

    if (!canViewAnalystDisplay(request.user?.email)
      && !OPERATOR_PROPOSE_TOOL_NAMES.has(pending.toolName)) {
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

  app.post('/api/chat', costlyRoutePreHandlers(authPreHandlerList(authHook)), async (request, reply) => {
    if (process.env.CHAT_MAINTAINER_ONLY === 'true' && !requireMaintainerAccess(request, reply)) {
      return;
    }

    auditFromRequest(request, 'chat.post', '/api/chat');
    const body = request.body ?? {};
    const { toolProfile } = body;

    const uid = chatOwnerUid(request);
    const sid = String(body.sessionId ?? '').trim();
    const prepared = chatSessionService.prepareTurn({
      ownerUid: uid,
      sessionId: sid,
      body,
      userEmail: request.user?.email ?? '',
    });
    if (prepared.error) {
      return reply.code(prepared.code).send({ error: prepared.error });
    }

    const { history, systemHint, display_view, userMessage, geoScope } = prepared;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let assistantText = '';
    const costRecorder = createHttpCostRecorder({
      script: 'http:chat',
      ownerUid: uid,
      route: '/api/chat',
    });
    const retrievalCache = createChatRetrievalCache(sid);
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort(new Error('Chat request timed out'));
    }, chatRequestTimeoutMs());

    const runChatTurn = async () => {
      await streamChat(
        userMessage,
        history,
        reply.raw,
        () => {
          const raw = reportReadPort?.getCachedReport
            ? reportReadPort.getCachedReport(evidenceStore, { scope: geoScope })
            : null;
          if (raw && typeof raw === 'object') {
            return { ...raw, display_view };
          }
          return raw;
        },
        {
          chatLlmPort,
          redactReportPayload: reportDisplayPort?.redactReportPayload ?? null,
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
          costRecorder,
          retrievalCache,
          llmPort,
          agentKernel: agentKernel ?? null,
          tracePort: tracePort ?? null,
          abortSignal: abortController.signal,
          onSend: (event) => {
            if (event?.type === 'text' && typeof event.text === 'string') assistantText += event.text;
          },
        },
      );
      await chatSessionService.finalizeTurn({
        ownerUid: uid,
        sessionId: sid,
        assistantText,
        userMessage,
        costRecorder,
      });
    };

    try {
      if (tracePort) {
        await tracePort.startActiveSpan(METRIC.CHAT_REQUEST, runChatTurn);
      } else {
        await runChatTurn();
      }
    } finally {
      clearTimeout(timeoutId);
      costRecorder.flush();
      reply.raw.end();
    }
  });
}
