/**
 * Chat turn preparation and post-stream persistence (non-SSE).
 */

import { buildChatSystemHint } from '../../evidence_submission/index.js';
import { resolveDisplayView } from '../../resilience_scorer/index.js';

/**
 * @param {object} opts
 * @param {import('../domain/ports/IChatSessionStorePort.js').IChatSessionStorePort} opts.chatStore
 * @param {import('../domain/ports/IChatLlmPort.js').IChatLlmPort} [opts.chatLlmPort]
 * @param {string} [opts.timezone]
 */
export function createChatSessionService(opts) {
  const chatStore = opts.chatStore;
  const chatLlmPort = opts.chatLlmPort;
  const generateTitle = chatLlmPort?.generateChatTitle
    ?? (async () => null);

  /**
   * @param {object} args
   * @param {string} args.ownerUid
   * @param {string} args.sessionId
   * @param {object} [args.body]
   * @param {string} [args.userEmail]
   * @returns {{ error: string, code: number } | { history: object[], systemHint: string, display_view: string, userMessage: string, geoScope: string, act: string }}
   */
  function prepareTurn({ ownerUid, sessionId, body = {}, userEmail = '' }) {
    const sid = String(sessionId ?? '').trim();
    if (!sid) {
      return { error: 'sessionId required', code: 400 };
    }
    const session = chatStore.getSession(sid);
    if (!session || session.owner_uid !== ownerUid) {
      return { error: 'session not found', code: 404 };
    }

    const existing = chatStore.listMessages({ sessionId: sid });
    let history = existing.map((m) => ({ role: m.role, content: m.content }));
    const scopeHint = buildChatSystemHint(body.scope);
    const extraHint = String(body.systemHint ?? '').trim();
    const systemHint = extraHint ? `${scopeHint}\n\n${extraHint}` : scopeHint;

    const display_view = resolveDisplayView({
      queryView: body.view,
      canViewAnalyst: Boolean(opts.canViewAnalyst?.(userEmail)),
    });

    const act = String(body.action ?? 'send');
    let userMessage = String(body.message ?? '').trim();
    const shouldPersistUser =
      act === 'send' || act === 'continue' || act === 'edit_resend';

    if (act === 'regenerate') {
      const lastUserIdx = history.findLastIndex((m) => m.role === 'user');
      if (lastUserIdx >= 0) {
        userMessage = String(history[lastUserIdx].content ?? '').trim();
        // Drop the previous answer and the user message itself — streamChat
        // re-appends the question, so the model regenerates from a clean slate.
        history = history.slice(0, lastUserIdx);
      } else {
        userMessage = '';
      }
    }

    if (!userMessage) {
      return { error: 'message required', code: 400 };
    }

    if (shouldPersistUser) {
      chatStore.addMessage({ sessionId: sid, role: 'user', content: userMessage, meta: { action: act } });
      chatStore.touchSession({ ownerUid, sessionId: sid });
    }

    const geoScope = body.reportGeoScope === 'north' ? 'north' : 'national';

    return {
      history,
      systemHint,
      display_view,
      userMessage,
      geoScope,
      act,
    };
  }

  /**
   * @param {object} args
   * @param {string} args.ownerUid
   * @param {string} args.sessionId
   * @param {string} args.assistantText
   * @param {string} args.userMessage
   * @param {object} [args.costRecorder]
   * @param {object|null} [args.meta] persisted on the assistant message (citations, tools)
   */
  async function finalizeTurn({ ownerUid, sessionId, assistantText, userMessage, costRecorder, meta = null }) {
    const sid = String(sessionId ?? '').trim();
    if (assistantText) {
      chatStore.addMessage({ sessionId: sid, role: 'assistant', content: assistantText, meta });
      chatStore.touchSession({ ownerUid, sessionId: sid });
    } else {
      // Failed/aborted turn with no text — don't spend on a title for it.
      return;
    }

    try {
      const current = chatStore.getSession(sid);
      if (current && current.owner_uid === ownerUid && !String(current.title ?? '').trim()) {
        const seed = chatStore.getFirstUserMessage({ sessionId: sid }) ?? userMessage;
        const title = await generateTitle(seed, { costRecorder });
        if (title) chatStore.renameSession({ ownerUid, sessionId: sid, title });
      }
    } catch {
      // Ignore title generation failures; chat still works.
    }
  }

  return { prepareTurn, finalizeTurn };
}
