import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * @param {string | null} date
 * @param {string} scope
 * @param {{ enabled?: boolean }} [opts]
 */
export function useValidationReviewQueue(date, scope, opts = {}) {
  const { getIdToken, apiReady } = useAuth();
  const enabled = opts.enabled !== false;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback(async () => {
    if (!apiReady || !date || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const params = new URLSearchParams({ date, status: 'pending' });
      if (scope && scope !== 'national') params.set('scope', scope);
      const res = await fetch(`/api/validation/review-queue?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err?.message ?? 'Failed to load validation queue');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiReady, date, scope, enabled, getIdToken]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const submitDecision = useCallback(async (articleKey, action, payload = {}) => {
    if (!date || !articleKey) return null;
    setSavingKey(articleKey);
    setError(null);
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const encKey = encodeURIComponent(articleKey);
      const encScope = encodeURIComponent(scope ?? 'national');
      const res = await fetch(
        `/api/validation/review-queue/${encodeURIComponent(date)}/${encScope}/${encKey}/decision`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, payload }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.article_key !== articleKey));
      return data;
    } catch (err) {
      setError(err?.message ?? 'Failed to save decision');
      return null;
    } finally {
      setSavingKey(null);
    }
  }, [date, scope, getIdToken]);

  return {
    items,
    loading,
    error,
    savingKey,
    reload: load,
    submitDecision,
  };
}
