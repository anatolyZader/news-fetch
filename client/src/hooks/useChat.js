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

export function useChat() {
  const { getIdToken, getAppCheckToken } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [streamState, setStreamState] = useState(initialChatStreamState);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pendingActions, setPendingActions] = useState([]);
  const abortRef = useRef(null);
  const streamStateRef = useRef(initialChatStreamState());

  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }), []);

  const authedHeaders = useCallback(async () => {
    const headers = await buildAuthHeaders({ getIdToken, getAppCheckToken });
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }, [getIdToken, getAppCheckToken]);

  const loadSessions = useCallback(async () => {
    const headers = await authedHeaders();
    const res = await fetch(`/api/chat/sessions?date=${encodeURIComponent(todayStr)}`, { headers });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    const data = await res.json();
    const list = data.sessions ?? [];
    setSessions(list);
    return list;
  }, [authedHeaders, todayStr]);

  const displaySessions = useMemo(() => {
    const active = activeSessionId;
    return sessions.filter((s) => (s.message_count ?? 0) > 0 || s.id === active);
  }, [sessions, activeSessionId]);

  const createSession = useCallback(async ({ title } = {}) => {
    const headers = await authedHeaders();
    const res = await fetch('/api/chat/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ date: todayStr, title: title ?? '' }),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    const data = await res.json();
    const id = data.id;
    if (id) setActiveSessionId(id);
    await loadSessions();
    return id;
  }, [authedHeaders, loadSessions, todayStr]);

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
    const headers = await authedHeaders();
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    setHistory([]);
    await loadSessions();
    setActiveSessionId((prev) => (prev === sessionId ? null : prev));
  }, [authedHeaders, loadSessions]);

  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    const headers = await authedHeaders();
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, { headers });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    const data = await res.json();
    const msgs = (data.messages ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content }));
    setHistory(msgs);
  }, [authedHeaders]);

  const deleteMessage = useCallback(async ({ sessionId, messageId }) => {
    const headers = await authedHeaders();
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    await loadMessages(sessionId);
    await loadSessions();
  }, [authedHeaders, loadMessages, loadSessions]);

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
    if (!streaming || !streamState.startedAt) {
      setElapsedSec(0);
      return undefined;
    }
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

  function completeSseOutcome(outcome, accumulated) {
    if (outcome.terminal === 'done') {
      if (outcome.event?.error) {
        const content = resolveAssistantErrorContent(outcome.event, accumulated);
        const meta = buildAssistantTurnMeta(outcome.event, content);
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
      const meta = buildAssistantTurnMeta(outcome.event, accumulated);
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
    const accRef = { value: '' };
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
          setPendingActions((prev) => [
            ...prev.filter((a) => a.actionId !== sideEffect.actionId),
            {
              actionId: sideEffect.actionId,
              toolName: sideEffect.toolName,
              summary: sideEffect.summary,
              expiresAt: sideEffect.expiresAt,
            },
          ]);
        }
        return terminal;
      });
      const accumulated = accRef.value;
      if (completeSseOutcome(outcome, accumulated)) return;

      if (accumulated) {
        const meta = buildAssistantTurnMeta(null, accumulated);
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
    deleteMessage,
    history,
    streaming,
    draft,
    streamState,
    elapsedSec,
    pendingActions,
    confirmAction,
    send,
    regenerateLast,
    stop,
  };
}
