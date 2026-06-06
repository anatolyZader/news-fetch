import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { authFetch } from '../lib/authFetch.js';
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
  const { getIdToken, getAppCheckToken, apiReady, appCheckRequired, costlyRouteReady } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const protectedReady = apiReady && (!appCheckRequired || costlyRouteReady);

  useEffect(() => {
    if (!protectedReady || !enabled) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const qs = new URLSearchParams({ scope, ...(date ? { date } : null) });
        const body = await authFetch(`/api/monitoring/summary?${qs.toString()}`, {
          getIdToken,
          getAppCheckToken,
        });
        if (cancelled) return;
        setData(body);
      } catch (err) {
        if (!cancelled) setError(err?.message ?? 'failed to load monitoring summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [protectedReady, getIdToken, getAppCheckToken, scope, date, enabled]);

  return { data, loading, error };
}

/** @deprecated alias — use useMonitoringSummary */
export const usePipelineStatus = useMonitoringSummary;
