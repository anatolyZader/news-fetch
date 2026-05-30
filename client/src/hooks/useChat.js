import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { buildAuthHeaders } from '../lib/authFetch.js';

export function useChat() {
  const { getIdToken, getAppCheckToken } = useAuth();
  const [sessions, setSessions] = useState([]); // [{ id, title, report_date, created_at, updated_at }]
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [history, setHistory] = useState([]); // [{ id?, role, content, error? }]
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState(''); // assistant reply being streamed
  const [pendingActions, setPendingActions] = useState([]);
  const abortRef = useRef(null);

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
    loadMessages(activeSessionId).catch(() => {});
  }, [activeSessionId, loadMessages]);

  function handleChatStreamEvent(event, accumulatedRef) {
    if (event.type === 'text') {
      accumulatedRef.value += event.text;
      setDraft(accumulatedRef.value);
      return null;
    }
    if (event.type === 'action_proposed') {
      setPendingActions((prev) => [
        ...prev.filter((a) => a.actionId !== event.actionId),
        {
          actionId: event.actionId,
          toolName: event.toolName,
          summary: event.summary,
          expiresAt: event.expiresAt,
        },
      ]);
      return null;
    }
    return event.type;
  }

  async function send(message, opts = {}) {
    if (streaming || !message.trim()) return;
    if (!activeSessionId) return;

    const userMsg = { role: 'user', content: message };
    setHistory((h) => [...h, userMsg]);
    setStreaming(true);
    setDraft('');

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';
    const accRef = { value: accumulated };

    try {
      const headers = await authedHeaders();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: activeSessionId,
          message,
          action: 'send',
          scope: opts.scope ?? null,
          reportGeoScope: opts.reportGeoScope ?? 'national',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        setHistory((h) => [...h, { role: 'assistant', content: errText || 'Request failed', error: true }]);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
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
            const terminal = handleChatStreamEvent(event, accRef);
            accumulated = accRef.value;
            if (terminal === 'done') {
              setHistory((h) => [...h, { role: 'assistant', content: accumulated }]);
              setDraft('');
              setStreaming(false);
              loadSessions().catch(() => {});
              return;
            }
            if (terminal === 'error') {
              setHistory((h) => [...h, { role: 'assistant', content: event.message || 'An error occurred', error: true }]);
              setDraft('');
              setStreaming(false);
              loadSessions().catch(() => {});
              return;
            }
          } catch {
            /* skip malformed SSE line */
          }
        }
      }

      // Stream ended without a done/error event — treat accumulated text as final
      if (accumulated) {
        setHistory((h) => [...h, { role: 'assistant', content: accumulated }]);
      }
      setDraft('');
      setStreaming(false);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (accumulated) {
          setHistory((h) => [...h, { role: 'assistant', content: accumulated + ' [stopped]' }]);
        }
      } else {
        setHistory((h) => [...h, { role: 'assistant', content: 'Connection error — please try again.', error: true }]);
      }
      setDraft('');
      setStreaming(false);
    }
  }

  async function regenerateLast(opts = {}) {
    if (streaming) return;
    if (!activeSessionId) return;
    setStreaming(true);
    setDraft('');
    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';
    const accRef = { value: accumulated };
    try {
      const headers = await authedHeaders();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: activeSessionId,
          action: 'regenerate',
          scope: null,
          reportGeoScope: opts.reportGeoScope ?? 'national',
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        setHistory((h) => [...h, { role: 'assistant', content: errText || 'Request failed', error: true }]);
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
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
            const terminal = handleChatStreamEvent(event, accRef);
            accumulated = accRef.value;
            if (terminal === 'done') {
              setHistory((h) => [...h, { role: 'assistant', content: accumulated }]);
              setDraft('');
              setStreaming(false);
              loadSessions().catch(() => {});
              return;
            }
            if (terminal === 'error') {
              setHistory((h) => [...h, { role: 'assistant', content: event.message || 'An error occurred', error: true }]);
              setDraft('');
              setStreaming(false);
              loadSessions().catch(() => {});
              return;
            }
          } catch { /* skip */ }
        }
      }
      if (accumulated) setHistory((h) => [...h, { role: 'assistant', content: accumulated }]);
      setDraft('');
      setStreaming(false);
    } catch (err) {
      setHistory((h) => [...h, { role: 'assistant', content: err?.name === 'AbortError' ? 'Cancelled.' : 'Connection error — please try again.', error: true }]);
      setDraft('');
      setStreaming(false);
    }
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
    pendingActions,
    confirmAction,
    send,
    regenerateLast,
    stop,
  };
}
