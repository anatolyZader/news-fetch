import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * POST /api/analyze (SSE) — national news pipeline run.
 */
export function useRunAnalysis() {
  const { getIdToken, apiReady } = useAuth();
  const [running, setRunning] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const runAnalysis = useCallback(async () => {
    if (!apiReady || running) return null;
    setRunning(true);
    setError(null);
    setProgressMessage('');
    setLastResult(null);

    try {
      const headers = new Headers({ Accept: 'text/event-stream' });
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);

      const res = await fetch('/api/analyze', { method: 'POST', headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');

      const decoder = new TextDecoder();
      let buffer = '';
      let donePayload = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let event;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (event.type === 'progress' && event.message) {
            setProgressMessage(String(event.message));
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Analysis failed');
          } else if (event.type === 'done') {
            donePayload = event;
          }
        }
      }

      if (!donePayload) throw new Error('Analysis ended without a result');
      const result = {
        assessment: donePayload.assessment,
        costUsd: donePayload.costUsd,
        date: donePayload.date,
        scope_artifacts: donePayload.scope_artifacts ?? null,
      };
      setLastResult(result);
      return result;
    } catch (err) {
      setError(err?.message ?? 'Analysis failed');
      return null;
    } finally {
      setRunning(false);
    }
  }, [apiReady, getIdToken, running]);

  const clearResult = useCallback(() => {
    setLastResult(null);
    setError(null);
    setProgressMessage('');
  }, []);

  return {
    runAnalysis,
    running,
    progressMessage,
    error,
    lastResult,
    clearResult,
  };
}
