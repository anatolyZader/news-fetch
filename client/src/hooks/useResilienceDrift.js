import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Loads the resilience drift dashboard payload from `GET /api/resilience/drift`.
 *
 * @param {{ scope?: 'national'|'north', days?: number }} [opts]
 */
export function useResilienceDrift(opts = {}) {
  const scope = opts.scope === 'north' ? 'north' : 'national';
  const days = Number.isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : 30;
  const { getIdToken, apiReady } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiReady) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const headers = new Headers();
      const token = await getIdToken();
      if (cancelled) return;
      if (token) headers.set('Authorization', `Bearer ${token}`);

      try {
        const res = await fetch(`/api/resilience/drift?scope=${scope}&days=${days}`, { headers });
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
  }, [apiReady, getIdToken, scope, days]);

  return { data, loading, error };
}
