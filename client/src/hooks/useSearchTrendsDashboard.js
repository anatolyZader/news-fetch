import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const FETCH_TIMEOUT_MS = 45_000;

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
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async (refresh = false) => {
    if (!apiReady) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    if (refresh) setRefreshing(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const headers = new Headers();
    try {
      const token = await getIdToken();
      if (requestId !== requestIdRef.current) return;
      if (token) headers.set('Authorization', `Bearer ${token}`);

      const qs = new URLSearchParams({
        district: districtId,
        days: String(days),
        ...(refresh ? { refresh: '1' } : null),
      });
      const res = await fetch(`/api/search-trends/dashboard?${qs.toString()}`, {
        headers,
        signal: controller.signal,
        cache: 'no-store',
      });
      if (requestId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (err?.name === 'AbortError') {
        setError('request timed out');
      } else {
        setError(err?.message ?? 'failed to load trends');
      }
    } finally {
      clearTimeout(timeoutId);
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [apiReady, getIdToken, districtId, days]);

  useEffect(() => {
    if (!enabled || !apiReady) return undefined;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load(false);
    });
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [enabled, apiReady, load]);

  return {
    data: enabled ? data : null,
    loading: enabled && apiReady && loading,
    refreshing: enabled && apiReady && refreshing,
    error: enabled ? error : null,
    reload: () => load(true),
  };
}
