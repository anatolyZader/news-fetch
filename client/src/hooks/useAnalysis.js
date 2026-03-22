import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Manages the analysis lifecycle:
 *   idle → running → done | error
 *
 * On mount, checks for a cached report and goes straight to 'done' if found.
 */
export function useAnalysis() {
  const { getIdToken, apiReady } = useAuth();
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [progress, setProgress] = useState([]); // array of message strings
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [costUsd, setCostUsd] = useState(null);

  useEffect(() => {
    if (!apiReady) return;

    (async () => {
      const headers = new Headers();
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);
      try {
        const r = await fetch('/api/report/today', { headers });
        const data = await r.json();
        if (data.found) {
          setReport(data.assessment);
          setStatus('done');
        }
      } catch {
        /* user can still click Analyze */
      }
    })();
  }, [apiReady, getIdToken]);

  function analyze() {
    setStatus('running');
    setProgress([]);
    setError(null);
    setReport(null);

    const controller = new AbortController();

    (async () => {
      const headers = new Headers();
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);

      fetch('/api/analyze', { method: 'POST', signal: controller.signal, headers })
        .then(async (res) => {
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
                handleEvent(event);
              } catch {
                /* skip malformed */
              }
            }
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            setError(err.message);
            setStatus('error');
          }
        });
    })();

    function handleEvent(event) {
      if (event.type === 'progress') {
        setProgress((prev) => [...prev, event.message]);
      } else if (event.type === 'usage') {
        setProgress((prev) => [...prev, `Cost so far: $${event.costUsd.toFixed(4)}`]);
      } else if (event.type === 'done') {
        setReport(event.assessment);
        setCostUsd(event.costUsd);
        setStatus('done');
      } else if (event.type === 'error') {
        setError(event.message);
        setStatus('error');
      }
    }
  }

  return { status, progress, report, error, costUsd, analyze };
}
