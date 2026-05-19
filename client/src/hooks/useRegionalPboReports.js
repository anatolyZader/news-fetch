import { useCallback, useEffect, useState } from 'react';

const REGION_URL_KEY = /^[a-z0-9_-]+$/;

function canonicalRegionalPboRegionId(regionId) {
  const s = String(regionId ?? '').trim().toLowerCase();
  if (!s || !REGION_URL_KEY.test(s)) return '';
  return s;
}

async function readFetchErrorMessage(res) {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    if (res.status === 404) {
      return 'HTTP 404 — API route not found (deploy or restart backend with latest code, or fix reverse-proxy /api routing).';
    }
    return `HTTP ${res.status}`;
  }
  try {
    const j = JSON.parse(trimmed);
    if (j && typeof j.error === 'string' && j.error.trim()) {
      return `HTTP ${res.status}: ${j.error.trim()}`;
    }
  } catch {
    /* not JSON (e.g. HTML error page) */
  }
  if (res.status === 404) {
    return 'HTTP 404 — API route not found (deploy or restart backend with latest code, or fix reverse-proxy /api routing).';
  }
  return `HTTP ${res.status}`;
}

/** Load daily regional PBO markdown reports (`/api/pbo/regional-report-days/:regionId`). */
export function useRegionalPboReports({ regionId, getIdToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const canon = canonicalRegionalPboRegionId(regionId);
    if (!canon) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch(`/api/pbo/regional-report-days/${encodeURIComponent(canon)}`, {
        headers,
      });
      if (!res.ok) throw new Error(await readFetchErrorMessage(res));
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, regionId]);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      if (!canonicalRegionalPboRegionId(regionId)) {
        setLoading(false);
        setData(null);
        setError(null);
        return;
      }
      await reload();
    })();
  }, [apiReady, regionId, reload]);

  return { data, loading, error, reload };
}
