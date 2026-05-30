import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/** Load PBO district registry summary (`GET /api/pbo/districts`). */
export function usePboDistricts() {
  const { getIdToken, apiReady } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch('/api/pbo/districts', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e?.message ?? 'Failed to load PBO districts');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!apiReady) return undefined;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void reload();
    });
    return () => {
      cancelled = true;
    };
  }, [apiReady, reload]);

  return { data, loading, error, reload };
}
