import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * @param {{ districtId?: string, days?: number, enabled?: boolean }} [opts]
 */
export function useSearchTrendsDashboard(opts = {}) {
  const enabled = opts.enabled !== false;
  const districtId = opts.districtId ?? 'national';
  const days = (() => {
    const n = Number.isFinite(opts.days) ? Math.floor(opts.days) : 7;
    return [1, 3, 7].includes(n) ? n : 7;
  })();
  const { getIdToken, apiReady } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (refresh = false) => {
    if (!apiReady) return;
    setLoading(true);
    setError(null);
    const headers = new Headers();
    const token = await getIdToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    try {
      const qs = new URLSearchParams({
        district: districtId,
        days: String(days),
        ...(refresh ? { refresh: '1' } : null),
      });
      const res = await fetch(`/api/search-trends/dashboard?${qs.toString()}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err?.message ?? 'failed to load trends');
    } finally {
      setLoading(false);
    }
  }, [apiReady, getIdToken, districtId, days]);

  useEffect(() => {
    if (!enabled || !apiReady) return;
    void (async () => {
      await load(false);
    })();
  }, [enabled, apiReady, load]);

  return {
    data: enabled ? data : null,
    loading: enabled && apiReady ? loading : !enabled ? false : true,
    error: enabled ? error : null,
    reload: () => load(true),
  };
}
