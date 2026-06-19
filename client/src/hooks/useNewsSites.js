import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../lib/authFetch.js';
import { withLang } from '../lib/localeFetch.js';

/** @param {{ getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean }} opts */
export function useNewsSitesDashboard({ getIdToken, getAppCheckToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await authFetch('/api/news-sites', { getIdToken, getAppCheckToken }));
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, getAppCheckToken]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const out = await authFetch('/api/news-sites', { getIdToken, getAppCheckToken });
        if (!cancelled) setData(out);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken, getAppCheckToken]);

  return { data, loading, error, reload };
}

/** @param {{ date: string, lang?: string, getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean }} opts */
export function useNewsSitesDailyFeed({ date, lang = 'en', getIdToken, getAppCheckToken, apiReady }) {
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
        const out = await authFetch(withLang(`/api/news-sites/daily?date=${encodeURIComponent(date)}`, lang), {
          getIdToken,
          getAppCheckToken,
        });
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
  }, [date, lang, apiReady, getIdToken, getAppCheckToken]);

  return { data, loading, error };
}
