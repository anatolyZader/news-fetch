import { useCallback, useEffect, useState } from 'react';
import { withOperatorDistrictQuery } from '../lib/clampOperatorDistrictScope.js';

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

/** @param {{ getIdToken: () => Promise<string|null>, apiReady: boolean, operatorScope?: string }} opts */
export function useSocialMediaDashboard({ getIdToken, apiReady, operatorScope = 'national' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await authFetch(withOperatorDistrictQuery('/api/social-media', operatorScope), { getIdToken }));
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, operatorScope]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const out = await authFetch(withOperatorDistrictQuery('/api/social-media', operatorScope), { getIdToken });
        if (!cancelled) setData(out);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken, operatorScope]);

  return { data, loading, error, reload };
}

/** @param {{ date: string, categoryId?: string, lang?: string, getIdToken: () => Promise<string|null>, apiReady: boolean, operatorScope?: string }} opts */
export function useSocialMediaDailyFeed({ date, categoryId, lang, getIdToken, apiReady, operatorScope = 'national' }) {
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
        const out = await authFetch(base, { getIdToken });
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
  }, [date, categoryId, lang, apiReady, getIdToken, operatorScope]);

  return { data, loading, error };
}

/** @param {{ getIdToken: () => Promise<string|null>, apiReady: boolean }} opts */
export function useSocialMediaPlatforms({ getIdToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      try {
        setData(await authFetch('/api/social-media/platforms', { getIdToken }));
      } catch {
        setData({ platforms: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, [apiReady, getIdToken]);

  return { data, loading };
}

/** @param {{ topic: string, platforms: string[], execute?: boolean, maxCostUsd?: number, lang?: string, getIdToken: () => Promise<string|null> }} opts */
export async function fetchSocialMediaTopic({ topic, platforms, execute, maxCostUsd, lang, getIdToken }) {
  return authFetch('/api/social-media/fetch-topic', {
    getIdToken,
    method: 'POST',
    body: { topic, platforms, execute: Boolean(execute), maxCostUsd, lang },
  });
}

/** @param {{ limit?: number, getIdToken: () => Promise<string|null> }} opts */
export async function fetchTopicFetchHistory({ limit = 30, getIdToken }) {
  const q = new URLSearchParams({ limit: String(limit) });
  const data = await authFetch(`/api/social-media/topic-fetches?${q.toString()}`, { getIdToken });
  return data?.searches ?? [];
}

/** @param {{ id: string, lang?: string, getIdToken: () => Promise<string|null> }} opts */
export async function loadTopicFetchById({ id, lang, getIdToken }) {
  const q = new URLSearchParams();
  if (lang) q.set('lang', lang);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return authFetch(`/api/social-media/topic-fetches/${encodeURIComponent(id)}${suffix}`, { getIdToken });
}

/** @deprecated use useSocialMediaDailyFeed */
export function useSocialMediaReport({ date, getIdToken, enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!date || !enabled) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ date });
        const out = await authFetch(`/api/social-media/report?${q.toString()}`, { getIdToken });
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
  }, [date, enabled, getIdToken]);

  return { data, loading, error };
}
