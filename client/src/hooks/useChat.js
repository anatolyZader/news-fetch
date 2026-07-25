import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { buildAuthHeaders } from '../lib/authFetch.js';
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
      return resolved;
    });
  }, [abortActiveStream]);

  const authedHeaders = useCallback(async () => {
    const headers = await buildAuthHeaders({ getIdToken, getAppCheckToken });
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }, [getIdToken, getAppCheckToken]);

  const loadSessions = useCallback(async () => {
    const headers = await authedHeaders();
    const res = await fetch('/api/chat/sessions?date=all', { headers });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    const data = await res.json();
    const list = data.sessions ?? [];
    setSessions(list);
    return list;
  }, [authedHeaders]);

  const displaySessions = useMemo(() => {
    const active = activeSessionId;
    return sessions.filter((s) => (s.message_count ?? 0) > 0 || s.id === active);
  }, [sessions, activeSessionId]);

  const createSession = useCallback(async ({ title } = {}) => {
    abortActiveStream();
    const headers = await authedHeaders();
    const res = await fetch('/api/chat/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ date: getTodayStr(), title: title ?? '' }),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    const data = await res.json();
    const id = data.id;
    if (id) setActiveSessionId(id);
    await loadSessions();
    return id;
  }, [authedHeaders, loadSessions, abortActiveStream, setActiveSessionId]);

  const renameSession = useCallback(async ({ sessionId, title }) => {
    const headers = await authedHeaders();
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    await loadSessions();
  }, [authedHeaders, loadSessions]);

  const deleteSession = useCallback(async ({ sessionId }) => {
    abortActiveStream();
    // No Content-Type here: Fastify rejects a bodyless DELETE that declares
    // application/json (FST_ERR_CTP_EMPTY_JSON_BODY).
    const headers = await buildAuthHeaders({ getIdToken, getAppCheckToken });
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    setHistory([]);
    const list = await loadSessions();
    const remaining = list.filter((s) => s.id !== sessionId);
    if (remaining.length > 0) {
      setActiveSessionIdRaw((prev) => (prev === sessionId ? remaining[0].id : prev));
    } else {
      await createSession({ title: '' });
    }
  }, [getIdToken, getAppCheckToken, loadSessions, createSession, abortActiveStream]);

  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    const headers = await authedHeaders();
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, { headers });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    const data = await res.json();
    const msgs = (data.messages ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, meta: m.meta ?? null }));
    setHistory(msgs);
  }, [authedHeaders]);

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
        if (!activeSessionId) setActiveSessionId(list[0].id);
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
    setStreaming(true);
    setDraft('');
  }

  function finishStreaming() {
    setDraft('');
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
      view: opts.view ?? 'operator',
      lang: opts.lang ?? 'en',
      ...partial,
    };
    const hint = opts.systemHint ?? null;
    if (hint && String(hint).trim()) {
      body.systemHint = String(hint).trim();
    }
    return body;
  }

  function completeSseOutcome(outcome, accumulated, citations = []) {
    const citationMeta = citations.length ? { citations } : {};
    if (outcome.terminal === 'done') {
      if (outcome.event?.error) {
        const content = resolveAssistantErrorContent(outcome.event, accumulated);
        const meta = { ...buildAssistantTurnMeta(outcome.event, content), ...citationMeta };
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
        loadSessions().catch(() => {});
        return true;
      }
      const meta = { ...buildAssistantTurnMeta(outcome.event, accumulated), ...citationMeta };
      setHistory((h) => [...h, { role: 'assistant', content: accumulated, meta }]);
      finishStreaming();
      loadSessions().catch(() => {});
      return true;
    }
    if (outcome.terminal === 'error') {
      const content = resolveAssistantErrorContent(outcome.event, accumulated);
      setHistory((h) => [
        ...h,
        { role: 'assistant', content, error: true, meta: { banner: 'error' } },
      ]);
      finishStreaming();
      loadSessions().catch(() => {});
      return true;
    }
    return false;
  }

  async function runChatStreamRequest(bodyPartial, opts, { onAbort } = {}) {
    const controller = new AbortController();
    abortRef.current = controller;
    const accRef = { value: '', citations: [] };
    const timeoutId = setTimeout(() => controller.abort(new Error('Chat request timed out')), chatClientTimeoutMs());

    try {
      const headers = await authedHeaders();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(buildChatRequestBody(bodyPartial, opts)),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        setHistory((h) => [...h, { role: 'assistant', content: errText || 'Request failed', error: true, meta: { banner: 'error' } }]);
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
      if (completeSseOutcome(outcome, accumulated, accRef.citations)) return;

      if (accumulated) {
        const meta = {
          ...buildAssistantTurnMeta(null, accumulated),
          ...(accRef.citations.length ? { citations: accRef.citations } : {}),
        };
        setHistory((h) => [...h, { role: 'assistant', content: accumulated, meta }]);
        finishStreaming();
        return;
      }

      setHistory((h) => [
        ...h,
        { role: 'assistant', content: 'Connection ended unexpectedly.', error: true, meta: { banner: 'error' } },
      ]);
      finishStreaming();
    } catch (err) {
      onAbort?.(err, accRef.value);
      finishStreaming();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function send(message, opts = {}) {
    if (streaming || !message.trim() || !activeSessionId) return;

    setHistory((h) => [...h, { role: 'user', content: message }]);
    beginStreaming();

    await runChatStreamRequest({ message, action: 'send' }, opts, {
      onAbort(err, accumulated) {
        if (err.name === 'AbortError') {
          if (accumulated) {
            setHistory((h) => [...h, { role: 'assistant', content: `${accumulated} [stopped]` }]);
          }
          return;
        }
        setHistory((h) => [
          ...h,
          { role: 'assistant', content: 'Connection error — please try again.', error: true, meta: { banner: 'error' } },
        ]);
      },
    });
  }

  async function regenerateLast(opts = {}) {
    if (streaming || !activeSessionId) return;
    beginStreaming();

    await runChatStreamRequest({ action: 'regenerate', scope: null }, opts, {
      onAbort(err) {
        const content = err?.name === 'AbortError' ? 'Cancelled.' : 'Connection error — please try again.';
        setHistory((h) => [...h, { role: 'assistant', content, error: true, meta: { banner: 'error' } }]);
      },
    });
  }

  function stop() {
    abortRef.current?.abort();
  }

  const fetchSource = useCallback(async (sourceId) => {
    const headers = await buildAuthHeaders({ getIdToken, getAppCheckToken });
    const res = await fetch(`/api/chat/source/${encodeURIComponent(sourceId)}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? `Source fetch failed (${res.status})`);
    }
    return res.json();
  }, [getIdToken, getAppCheckToken]);

  async function confirmAction(actionId, confirmed) {
    if (!activeSessionId || !actionId) return null;
    try {
      const headers = await authedHeaders();
      const res = await fetch('/api/chat/confirm-action', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: activeSessionId, actionId, confirmed }),
      });
      const data = await res.json();
      setPendingActions((prev) => prev.filter((a) => a.actionId !== actionId));
      return data;
    } catch {
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
    regenerateLast,
    stop,
    todayStr: getTodayStr(),
  };
}
