/**
 * Chat turn preparation and post-stream persistence (non-SSE).
 */

import { buildChatSystemHint } from '../../../api/routes/submissionHelpers.js';
import { resolveDisplayView } from '../../resilience/index.js';
import { generateChatTitle } from '../infrastructure/claudeChat.js';

/**
 * @param {object} opts
 * @param {import('../infrastructure/chatStore.js').ChatStore} opts.chatStore
 * @param {string} [opts.timezone]
 * @param {typeof generateChatTitle} [opts.generateChatTitle]
 */
export function createChatSessionService(opts) {
  const chatStore = opts.chatStore;
  const generateTitle = opts.generateChatTitle ?? generateChatTitle;

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
    const history = existing.map((m) => ({ role: m.role, content: m.content }));
    const scopeHint = buildChatSystemHint(body.scope);
    const extraHint = String(body.systemHint ?? '').trim();
    const systemHint = extraHint ? `${scopeHint}\n\n${extraHint}` : scopeHint;

    const display_view = resolveDisplayView({
      queryView: body.view,
      userEmail,
    });

    const act = String(body.action ?? 'send');
    let userMessage = String(body.message ?? '').trim();
    const shouldPersistUser =
      act === 'send' || act === 'continue' || act === 'edit_resend';

    if (act === 'regenerate') {
      const lastUser = [...existing].reverse().find((m) => m.role === 'user');
      userMessage = String(lastUser?.content ?? '').trim();
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
   */
  async function finalizeTurn({ ownerUid, sessionId, assistantText, userMessage, costRecorder }) {
    const sid = String(sessionId ?? '').trim();
    if (assistantText) {
      chatStore.addMessage({ sessionId: sid, role: 'assistant', content: assistantText, meta: null });
      chatStore.touchSession({ ownerUid, sessionId: sid });
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
