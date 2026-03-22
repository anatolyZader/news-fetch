import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export function useChat() {
  const { getIdToken } = useAuth();
  const [history, setHistory] = useState([]); // [{ role, content }]
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState(''); // assistant reply being streamed

  async function send(message) {
    if (streaming || !message.trim()) return;

    const userMsg = { role: 'user', content: message };
    setHistory((h) => [...h, userMsg]);
    setStreaming(true);
    setDraft('');

    let accumulated = '';

    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, history }),
      });

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
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      setStreaming(false);
      setDraft('');
    }
  }

  return { history, streaming, draft, send };
}
