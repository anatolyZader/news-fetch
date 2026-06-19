import { useCallback, useEffect, useState } from 'react';
import { withOperatorDistrictQuery } from '../lib/clampOperatorDistrictScope.js';
import { authFetch } from '../lib/authFetch.js';
import { withLang } from '../lib/localeFetch.js';

/** @param {{ getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean, operatorScope?: string }} opts */
export function useRadioDashboard({ getIdToken, getAppCheckToken, apiReady, operatorScope = 'national' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const auth = { getIdToken, getAppCheckToken };

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await authFetch(withOperatorDistrictQuery('/api/radio', operatorScope), auth));
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, getAppCheckToken, operatorScope]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const out = await authFetch(withOperatorDistrictQuery('/api/radio', operatorScope), auth);
        if (!cancelled) setData(out);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken, getAppCheckToken, operatorScope]);

  return { data, loading, error, reload };
}

/** @param {{ date: string, lang?: string, getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean, operatorScope?: string }} opts */
export function useRadioDailyFeed({ date, lang = 'en', getIdToken, getAppCheckToken, apiReady, operatorScope = 'national' }) {
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
        const base = withOperatorDistrictQuery(
          withLang(`/api/radio/daily?date=${encodeURIComponent(date)}`, lang),
          operatorScope,
        );
        const out = await authFetch(base, { getIdToken, getAppCheckToken });
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
  }, [date, lang, apiReady, getIdToken, getAppCheckToken, operatorScope]);

  return { data, loading, error };
}
