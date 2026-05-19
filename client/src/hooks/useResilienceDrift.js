import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Loads the resilience drift dashboard payload from `GET /api/resilience/drift`.
 *
 * @param {{ scope?: 'national'|'north', days?: number, endDate?: string, enabled?: boolean }} [opts]
 */
export function useResilienceDrift(opts = {}) {
  const enabled = opts.enabled !== false;
  const scope = opts.scope === 'north' ? 'north' : 'national';
  const days = Number.isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : 30;
  const endDate =
    typeof opts.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.endDate.trim())
      ? opts.endDate.trim()
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
        const qs = new URLSearchParams({
          scope,
          days: String(days),
          ...(endDate ? { end_date: endDate } : null),
        });
        const res = await fetch(`/api/resilience/drift?${qs.toString()}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        setData(body);
      } catch (err) {
        if (!cancelled) setError(err?.message ?? 'failed to load drift');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [apiReady, getIdToken, scope, days, endDate, enabled]);

  return {
    data: apiReady && enabled ? data : null,
    loading: apiReady && enabled ? loading : false,
    error: apiReady && enabled ? error : null,
  };
}
