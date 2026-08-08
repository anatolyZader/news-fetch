import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { authFetch, buildAuthHeaders } from '../lib/authFetch.js';
import {
  initialChatStreamState,
  reduceChatStreamEvent,
  buildAssistantTurnMeta,
  resolveAssistantErrorContent,
} from '../lib/chatStreamReducer.js';
import { chatClientTimeoutMs } from '../lib/chatStreamStatus.js';

async function consumeChatSseStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        const terminal = onEvent(event);
        if (terminal === 'done' || terminal === 'error') {
          return { terminal, event };
        }
      } catch {
        /* skip malformed SSE line */
      }
    }
  }
  return { terminal: null, event: null };
}

function upsertPendingAction(prev, sideEffect) {
  return [
    ...prev.filter((a) => a.actionId !== sideEffect.actionId),
    {
      actionId: sideEffect.actionId,
      toolName: sideEffect.toolName,
      summary: sideEffect.summary,
      expiresAt: sideEffect.expiresAt,
    },
  ];
}

function getTodayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

const LS_CHAT_SESSION = 'chatActiveSessionId';

function buildTurnExtras(accRef) {
  return {
    ...(accRef.citations?.length ? { citations: accRef.citations } : {}),
    ...(accRef.suggestions?.length ? { suggestions: accRef.suggestions } : {}),
  };
}

function readStoredSessionId() {
  try {
    return localStorage.getItem(LS_CHAT_SESSION) || null;
  } catch {
    return null;
  }
}

function storeSessionId(id) {
  try {
    if (id) localStorage.setItem(LS_CHAT_SESSION, id);
    else localStorage.removeItem(LS_CHAT_SESSION);
  } catch { /* storage unavailable */ }
}

export function useChat() {
  const { getIdToken, getAppCheckToken } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionIdRaw] = useState(null);
  const [history, setHistory] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [streamState, setStreamState] = useState(initialChatStreamState);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pendingActions, setPendingActions] = useState([]);
  const abortRef = useRef(null);
  const streamStateRef = useRef(initialChatStreamState());
  const streamingRef = useRef(false);
  const activeSessionIdRef = useRef(null);

  // Any session transition must kill an in-flight stream: the client abort
  // closes the SSE socket, which triggers the server-side LLM abort — without
  // this, switching or opening a chat leaves the old turn running (and billing).
  const abortActiveStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Unmount (panel closed via Slide unmountOnExit, popup navigation, …) must
  // also kill the stream — an orphaned fetch keeps the server turn billing.
  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const setActiveSessionId = useCallback((next) => {
    setActiveSessionIdRaw((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (resolved !== prev) abortActiveStream();
      storeSessionId(resolved);
      activeSessionIdRef.current = resolved;
      return resolved;
    });
  }, [abortActiveStream]);

  // Non-SSE calls go through authFetch for its single forced-token-refresh
  // retry on 401 — raw fetch here previously meant an expired token surfaced
  // as a hard error instead of a silent refresh.
  const chatApiFetch = useCallback(
    (url, opts = {}) => authFetch(url, { getIdToken, getAppCheckToken, ...opts }),
    [getIdToken, getAppCheckToken],
  );

  const loadSessions = useCallback(async () => {
    const data = await chatApiFetch('/api/chat/sessions?date=all');
    const list = data.sessions ?? [];
    setSessions(list);
    return list;
  }, [chatApiFetch]);

  const displaySessions = useMemo(() => {
    const active = activeSessionId;
    return sessions.filter((s) => (s.message_count ?? 0) > 0 || s.id === active);
  }, [sessions, activeSessionId]);

  const createSession = useCallback(async ({ title } = {}) => {
    abortActiveStream();
    const data = await chatApiFetch('/api/chat/sessions', {
      method: 'POST',
      body: { date: getTodayStr(), title: title ?? '' },
    });
    const id = data.id;
    if (id) setActiveSessionId(id);
    await loadSessions();
    return id;
  }, [chatApiFetch, loadSessions, abortActiveStream, setActiveSessionId]);

  const renameSession = useCallback(async ({ sessionId, title }) => {
    await chatApiFetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      body: { title },
    });
    await loadSessions();
  }, [chatApiFetch, loadSessions]);

  const deleteSession = useCallback(async ({ sessionId }) => {
    abortActiveStream();
    // authFetch sends no Content-Type for a bodyless DELETE, which is what
    // Fastify requires (FST_ERR_CTP_EMPTY_JSON_BODY otherwise).
    const data = await chatApiFetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    if (data.ok === false) {
      throw new Error(data.error || 'Delete failed');
    }
    setHistory([]);
    const list = await loadSessions();
    const remaining = list.filter((s) => s.id !== sessionId);
    if (remaining.length > 0) {
      setActiveSessionIdRaw((prev) => (prev === sessionId ? remaining[0].id : prev));
    } else {
      await createSession({ title: '' });
    }
  }, [chatApiFetch, loadSessions, createSession, abortActiveStream]);

  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    const data = await chatApiFetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`);
    const msgs = (data.messages ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, meta: m.meta ?? null }));
    setHistory(msgs);
  }, [chatApiFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await loadSessions();
        if (cancelled) return;
        if (list.length === 0) {
          const id = await createSession({ title: '' });
          if (!cancelled) setActiveSessionId(id);
          return;
        }
        if (!activeSessionId) {
          // Restore the last-used session across panel closes and reloads.
          const stored = readStoredSessionId();
          const restored = stored && list.some((s) => s.id === stored) ? stored : list[0].id;
          setActiveSessionId(restored);
        }
      } catch {
        // ignore; chat will show errors on send
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    queueMicrotask(() => { loadMessages(activeSessionId).catch(() => {}); });
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    if (!streaming || !streamState.startedAt) return undefined;
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - streamState.startedAt) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [streaming, streamState.startedAt]);

  function beginStreaming() {
    const startedAt = Date.now();
    const next = { ...initialChatStreamState(), startedAt, phase: 'thinking' };
    streamStateRef.current = next;
    setStreamState(next);
    setElapsedSec(0);
    streamingRef.current = true;
    setStreaming(true);
    setDraft('');
  }

  function finishStreaming() {
    setDraft('');
    streamingRef.current = false;
    setStreaming(false);
    streamStateRef.current = initialChatStreamState();
    setStreamState(initialChatStreamState());
    setElapsedSec(0);
  }

  function buildChatRequestBody(partial, opts = {}) {
    const body = {
      sessionId: activeSessionId,
      reportGeoScope: opts.reportGeoScope ?? 'national',
      scope: opts.scope ?? null,
      toolProfile: opts.toolProfile ?? 'default',
      view: opts.view ?? 'user',
      lang: opts.lang ?? 'en',
      ...partial,
    };
    const hint = opts.systemHint ?? null;
    if (hint && String(hint).trim()) {
      body.systemHint = String(hint).trim();
    }
    return body;
  }

  // The server generates the session title (and rolling summary) *after* the
  // done event, so an immediate refresh still sees "Untitled" — refresh again
  // once the post-stream work has had time to land.
  const titleRefreshRef = useRef(null);
  useEffect(() => () => clearTimeout(titleRefreshRef.current), []);
  function refreshSessionsSoon() {
    loadSessions().catch(() => {});
    clearTimeout(titleRefreshRef.current);
    titleRefreshRef.current = setTimeout(() => {
      loadSessions().catch(() => {});
      // Sync the transcript with the server copy (message ids for editing,
      // grounded citations, persisted stopped/error flags) — but never while
      // a newer turn is already streaming.
      const sid = activeSessionIdRef.current;
      if (!streamingRef.current && sid) {
        loadMessages(sid).catch(() => {});
      }
    }, 2500);
  }

  function completeSseOutcome(outcome, accumulated, accRef) {
    const extras = buildTurnExtras(accRef);
    if (outcome.terminal === 'done') {
      if (outcome.event?.error) {
        const content = resolveAssistantErrorContent(outcome.event, accumulated);
        const meta = { ...buildAssistantTurnMeta(outcome.event, content), ...extras };
        setHistory((h) => [
          ...h,
          {
            role: 'assistant',
            content,
            error: true,
            meta,
          },
        ]);
        finishStreaming();
        refreshSessionsSoon();
        return true;
      }
      const meta = { ...buildAssistantTurnMeta(outcome.event, accumulated), ...extras };
      setHistory((h) => [...h, { role: 'assistant', content: accumulated, meta }]);
      finishStreaming();
      refreshSessionsSoon();
      return true;
    }
    if (outcome.terminal === 'error') {
      const content = resolveAssistantErrorContent(outcome.event, accumulated);
      setHistory((h) => [
        ...h,
        { role: 'assistant', content, error: true, meta: { banner: 'error', ...extras } },
      ]);
      finishStreaming();
      refreshSessionsSoon();
      return true;
    }
    return false;
  }

  async function runChatStreamRequest(bodyPartial, opts, { onAbort } = {}) {
    const controller = new AbortController();
    abortRef.current = controller;
    const accRef = { value: '', citations: [] };
    const timeoutId = setTimeout(() => controller.abort(new Error('Chat request timed out')), chatClientTimeoutMs());

    // The SSE turn cannot go through authFetch (it needs the raw stream), so
    // it gets its own single forced-refresh retry on 401.
    const postChatStream = async (forceRefresh) => {
      const headers = await buildAuthHeaders({
        getIdToken: forceRefresh ? () => getIdToken({ forceRefresh: true }) : getIdToken,
        getAppCheckToken,
      });
      headers.set('Content-Type', 'application/json');
      return fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(buildChatRequestBody(bodyPartial, opts)),
        signal: controller.signal,
      });
    };

    try {
      let res = await postChatStream(false);
      if (res.status === 401) {
        res = await postChatStream(true);
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        let message = errText || 'Request failed';
        try {
          const parsed = JSON.parse(errText);
          message = parsed?.message || parsed?.error || message;
        } catch { /* plain-text error body */ }
        setHistory((h) => [...h, { role: 'assistant', content: message, error: true, meta: { banner: 'error' } }]);
        finishStreaming();
        return;
      }

      const outcome = await consumeChatSseStream(res, (event) => {
        const { state, terminal, event: sideEffect } = reduceChatStreamEvent(
          streamStateRef.current,
          event,
          accRef,
        );
        streamStateRef.current = state;
        setStreamState(state);
        if (event.type === 'text') {
          setDraft(accRef.value);
        }
        if (sideEffect?.type === 'action_proposed') {
          setPendingActions((prev) => upsertPendingAction(prev, sideEffect));
        }
        return terminal;
      });
      const accumulated = accRef.value;
      if (completeSseOutcome(outcome, accumulated, accRef)) return;

      if (accumulated) {
        const meta = {
          ...buildAssistantTurnMeta(null, accumulated),
          ...buildTurnExtras(accRef),
        };
        setHistory((h) => [...h, { role: 'assistant', content: accumulated, meta }]);
        finishStreaming();
        return;
      }

      // Stream ended without a terminal event and no text — surface as a
      // connection-loss banner (text comes from i18n at render time).
      setHistory((h) => [
        ...h,
        { role: 'assistant', content: '', error: true, meta: { banner: 'connection_lost' } },
      ]);
      finishStreaming();
    } catch (err) {
      onAbort?.(err, accRef.value);
      finishStreaming();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Abort/connection outcomes are stored as meta flags, not prose — the panel
  // renders them via i18n banners, and they match what the server persists.
  function commitInterruptedTurn(err, accumulated) {
    if (err?.name === 'AbortError') {
      if (accumulated) {
        setHistory((h) => [...h, { role: 'assistant', content: accumulated, meta: { stopped: true } }]);
      }
      return;
    }
    setHistory((h) => [
      ...h,
      {
        role: 'assistant',
        content: accumulated || '',
        error: true,
        meta: { banner: 'connection_lost' },
      },
    ]);
  }

  async function send(message, opts = {}) {
    if (streaming || !message.trim() || !activeSessionId) return;

    setHistory((h) => [...h, { role: 'user', content: message }]);
    beginStreaming();

    await runChatStreamRequest({ message, action: 'send' }, opts, {
      onAbort: commitInterruptedTurn,
    });
  }

  /**
   * True edit-and-resubmit: hides the edited user message and everything after
   * it server-side (linear rewrite), then streams a fresh answer.
   */
  async function editMessage(messageId, message, opts = {}) {
    if (streaming || !message.trim() || !activeSessionId || !messageId) return;

    setHistory((h) => {
      const idx = h.findIndex((m) => m.id === messageId);
      const base = idx >= 0 ? h.slice(0, idx) : h;
      return [...base, { role: 'user', content: message }];
    });
    beginStreaming();

    await runChatStreamRequest({ message, messageId, action: 'edit_resend' }, opts, {
      onAbort: commitInterruptedTurn,
    });
  }

  async function regenerateLast(opts = {}) {
    if (streaming || !activeSessionId) return;
    // Drop the stale answer locally; the server truncates its copy on regenerate.
    setHistory((h) => {
      const lastUserIdx = h.findLastIndex((m) => m.role === 'user');
      return lastUserIdx >= 0 ? h.slice(0, lastUserIdx + 1) : h;
    });
    beginStreaming();

    await runChatStreamRequest({ action: 'regenerate', scope: null }, opts, {
      onAbort: commitInterruptedTurn,
    });
  }

  function stop() {
    abortRef.current?.abort();
  }

  const fetchSource = useCallback(
    (sourceId) => chatApiFetch(`/api/chat/source/${encodeURIComponent(sourceId)}`),
    [chatApiFetch],
  );

  async function confirmAction(actionId, confirmed) {
    if (!activeSessionId || !actionId) return null;
    try {
      const data = await chatApiFetch('/api/chat/confirm-action', {
        method: 'POST',
        body: { sessionId: activeSessionId, actionId, confirmed },
      });
      setPendingActions((prev) => prev.filter((a) => a.actionId !== actionId));
      return data;
    } catch {
      setPendingActions((prev) => prev.filter((a) => a.actionId !== actionId));
      return null;
    }
  }

  return {
    sessions: displaySessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    renameSession,
    deleteSession,
    history,
    streaming,
    draft,
    streamState,
    elapsedSec: streaming ? elapsedSec : 0,
    pendingActions,
    confirmAction,
    fetchSource,
    send,
    editMessage,
    regenerateLast,
    refreshSessions: loadSessions,
    stop,
    todayStr: getTodayStr(),
  };
}
