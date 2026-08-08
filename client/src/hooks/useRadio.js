import { useCallback, useEffect, useState } from 'react';
import { withUserDistrictQuery } from '../lib/clampUserDistrictScope.js';
import { authFetch } from '../lib/authFetch.js';
import { localizedAuthFetch } from '../lib/localizedAuthFetch.js';

/** @param {{ getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean, userScope?: string }} opts */
export function useRadioDashboard({ getIdToken, getAppCheckToken, apiReady, userScope = 'national' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const auth = { getIdToken, getAppCheckToken };

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await authFetch(withUserDistrictQuery('/api/radio', userScope), auth));
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, getAppCheckToken, userScope]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const out = await authFetch(withUserDistrictQuery('/api/radio', userScope), auth);
        if (!cancelled) setData(out);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken, getAppCheckToken, userScope]);

  return { data, loading, error, reload };
}

/** @param {{ date: string, lang?: string, getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean, userScope?: string }} opts */
export function useRadioDailyFeed({ date, lang = 'en', getIdToken, getAppCheckToken, apiReady, userScope = 'national' }) {
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
        const base = withUserDistrictQuery(
          `/api/radio/daily?date=${encodeURIComponent(date)}`,
          userScope,
        );
        const out = await localizedAuthFetch(base, { lang, getIdToken, getAppCheckToken });
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
  }, [date, lang, apiReady, getIdToken, getAppCheckToken, userScope]);

  return { data, loading, error };
}
