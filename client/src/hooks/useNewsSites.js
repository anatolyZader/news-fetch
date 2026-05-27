import { useCallback, useEffect, useState } from 'react';

async function authFetch(url, { getIdToken, method = 'GET', body } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = await getIdToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/** @param {{ getIdToken: () => Promise<string|null>, apiReady: boolean }} opts */
export function useNewsSitesDashboard({ getIdToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await authFetch('/api/news-sites', { getIdToken }));
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const out = await authFetch('/api/news-sites', { getIdToken });
        if (!cancelled) setData(out);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken]);

  return { data, loading, error, reload };
}

/** @param {{ date: string, getIdToken: () => Promise<string|null>, apiReady: boolean }} opts */
export function useNewsSitesDailyFeed({ date, getIdToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!date || !apiReady) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ date });
        const out = await authFetch(`/api/news-sites/daily?${q.toString()}`, { getIdToken });
        if (!cancelled) setData(out);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, apiReady, getIdToken]);

  return { data, loading, error };
}
