import { useCallback, useState } from 'react';
import { authFetch } from '../lib/authFetch.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * PBO historical search via /api/pbo/historical-search.
 */
export function usePboHistoricalSearch({ getIdToken, getAppCheckToken, apiReady } = {}) {
  const auth = useAuth();
  const tokenFn = getIdToken ?? auth.getIdToken;
  const appCheckFn = getAppCheckToken ?? auth.getAppCheckToken;
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
      const qs = new URLSearchParams({ query });
      if (params?.date) qs.set('date', params.date);
      if (params?.district) qs.set('district', params.district);
      if (params?.municipality) qs.set('municipality', params.municipality);
      if (params?.region) qs.set('region', params.region);
      if (params?.days != null) qs.set('days', String(params.days));

      const data = await authFetch(`/api/pbo/historical-search?${qs}`, {
        getIdToken: tokenFn,
        getAppCheckToken: appCheckFn,
      });
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
  }, [ready, tokenFn, appCheckFn]);

  return { hits, loading, error, search, clear: () => { setHits([]); setError(null); } };
}
