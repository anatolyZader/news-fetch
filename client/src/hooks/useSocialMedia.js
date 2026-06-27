import { useCallback, useEffect, useState } from 'react';
import { withOperatorDistrictQuery } from '../lib/clampOperatorDistrictScope.js';
import { authFetch } from '../lib/authFetch.js';
import { localizedAuthFetch } from '../lib/localizedAuthFetch.js';

/** @param {{ getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean, operatorScope?: string }} opts */
export function useSocialMediaDashboard({ getIdToken, getAppCheckToken, apiReady, operatorScope = 'national' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const auth = { getIdToken, getAppCheckToken };

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await authFetch(withOperatorDistrictQuery('/api/social-media', operatorScope), auth));
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
        const out = await authFetch(withOperatorDistrictQuery('/api/social-media', operatorScope), auth);
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

/** @param {{ date: string, categoryId?: string, lang?: string, getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean, operatorScope?: string }} opts */
export function useSocialMediaDailyFeed({ date, categoryId, lang, getIdToken, getAppCheckToken, apiReady, operatorScope = 'national' }) {
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
        if (categoryId) q.set('category', categoryId);
        if (lang) q.set('lang', lang);
        const base = withOperatorDistrictQuery(`/api/social-media/daily?${q.toString()}`, operatorScope);
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
  }, [date, categoryId, lang, apiReady, getIdToken, getAppCheckToken, operatorScope]);

  return { data, loading, error };
}

/** @param {{ getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady: boolean }} opts */
export function useSocialMediaPlatforms({ getIdToken, getAppCheckToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      try {
        setData(await authFetch('/api/social-media/platforms', { getIdToken, getAppCheckToken }));
      } catch {
        setData({ platforms: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, [apiReady, getIdToken, getAppCheckToken]);

  return { data, loading };
}

/** @param {{ topic: string, platforms: string[], execute?: boolean, maxCostUsd?: number, lang?: string, getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null> }} opts */
export async function fetchSocialMediaTopic({ topic, platforms, execute, maxCostUsd, lang, getIdToken, getAppCheckToken }) {
  return authFetch('/api/social-media/fetch-topic', {
    getIdToken,
    getAppCheckToken,
    method: 'POST',
    body: { topic, platforms, execute: Boolean(execute), maxCostUsd, lang },
  });
}

/** @param {{ limit?: number, getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null> }} opts */
export async function fetchTopicFetchHistory({ limit = 30, getIdToken, getAppCheckToken }) {
  const q = new URLSearchParams({ limit: String(limit) });
  const data = await authFetch(`/api/social-media/topic-fetches?${q.toString()}`, { getIdToken, getAppCheckToken });
  return data?.searches ?? [];
}

/** @param {{ id: string, lang?: string, getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null> }} opts */
export async function loadTopicFetchById({ id, lang, getIdToken, getAppCheckToken }) {
  const q = new URLSearchParams();
  if (lang) q.set('lang', lang);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return authFetch(`/api/social-media/topic-fetches/${encodeURIComponent(id)}${suffix}`, { getIdToken, getAppCheckToken });
}

/** @param {{ date: string, lang?: string, getIdToken: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, enabled?: boolean }} opts */
export function useSocialMediaReport({ date, lang = 'en', getIdToken, getAppCheckToken, enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !date) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ date });
        const out = await localizedAuthFetch(`/api/social-media/report?${q.toString()}`, {
          lang,
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
  }, [date, lang, enabled, getIdToken, getAppCheckToken]);

  return { data, loading, error };
}
