import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Analyst PBO historical search via /api/pbo/historical-search.
 */
export function usePboHistoricalSearch({ getIdToken, apiReady } = {}) {
  const auth = useAuth();
  const tokenFn = getIdToken ?? auth.getIdToken;
  const ready = apiReady ?? auth.apiReady;

  const [hits, setHits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = useCallback(async (params) => {
    const query = String(params?.query ?? '').trim();
    if (!query || !ready) return { hits: [] };
    setLoading(true);
    setError(null);
    try {
      const token = await tokenFn?.();
      const qs = new URLSearchParams({ query });
      if (params?.date) qs.set('date', params.date);
      if (params?.district) qs.set('district', params.district);
      if (params?.municipality) qs.set('municipality', params.municipality);
      if (params?.region) qs.set('region', params.region);
      if (params?.days != null) qs.set('days', String(params.days));

      const res = await fetch(`/api/pbo/historical-search?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? res.statusText);
      }
      const data = await res.json();
      const next = data.hits ?? [];
      setHits(next);
      return data;
    } catch (e) {
      setError(e?.message ?? 'Search failed');
      setHits([]);
      return { hits: [], error: e?.message };
    } finally {
      setLoading(false);
    }
  }, [ready, tokenFn]);

  return { hits, loading, error, search, clear: () => { setHits([]); setError(null); } };
}
