import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { normalizeReportScopeId } from '../lib/reportScopes.js';

/**
 * Loads unified monitoring summary from GET /api/monitoring/summary (analyst-only).
 *
 * @param {{ scope?: string, date?: string, enabled?: boolean }} [opts]
 */
export function useMonitoringSummary(opts = {}) {
  const enabled = opts.enabled !== false;
  const scope = normalizeReportScopeId(opts.scope);
  const date =
    typeof opts.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.date.trim())
      ? opts.date.trim()
      : '';
  const { getIdToken, apiReady } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiReady || !enabled) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setData(null);

      const headers = new Headers();
      const token = await getIdToken();
      if (cancelled) return;
      if (token) headers.set('Authorization', `Bearer ${token}`);

      try {
        const qs = new URLSearchParams({ scope, ...(date ? { date } : null) });
        const res = await fetch(`/api/monitoring/summary?${qs.toString()}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        setData(body);
      } catch (err) {
        if (!cancelled) setError(err?.message ?? 'failed to load monitoring summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [apiReady, getIdToken, scope, date, enabled]);

  return { data, loading, error };
}

/** @deprecated alias — use useMonitoringSummary */
export const usePipelineStatus = useMonitoringSummary;
