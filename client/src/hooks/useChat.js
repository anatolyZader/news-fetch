import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export function useChat() {
  const { getIdToken } = useAuth();
  const [history, setHistory] = useState([]); // [{ role, content, error? }]
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState(''); // assistant reply being streamed
  const abortRef = useRef(null);

  async function send(message) {
    if (streaming || !message.trim()) return;

    const userMsg = { role: 'user', content: message };
    setHistory((h) => [...h, userMsg]);
    setStreaming(true);
    setDraft('');

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';

    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, history }),
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
            if (event.type === 'text') {
              accumulated += event.text;
              setDraft(accumulated);
            } else if (event.type === 'done') {
              setHistory((h) => [...h, { role: 'assistant', content: accumulated }]);
              setDraft('');
              setStreaming(false);
              return;
            } else if (event.type === 'error') {
              setHistory((h) => [...h, { role: 'assistant', content: event.message || 'An error occurred', error: true }]);
              setDraft('');
              setStreaming(false);
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

  function stop() {
    abortRef.current?.abort();
  }

  return { history, streaming, draft, send, stop };
}
