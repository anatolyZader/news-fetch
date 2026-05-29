import { useCallback, useEffect, useState } from 'react';

const REGION_URL_KEY = /^[a-z0-9_-]+$/;
const DISTRICT_URL_KEY = /^[a-z0-9_-]+$/;

function canonicalDistrictId(districtId) {
  const s = String(districtId ?? 'north').trim().toLowerCase();
  if (!s || !DISTRICT_URL_KEY.test(s)) return 'north';
  return s;
}

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

/** Load daily regional PBO markdown reports (`/api/pbo/regional-report-days/:districtId/:regionId`). */
export function useRegionalPboReports({ districtId = 'north', regionId, getIdToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const district = canonicalDistrictId(districtId);
    const region = canonicalRegionalPboRegionId(regionId);
    if (!region) {
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
      const res = await fetch(
        `/api/pbo/regional-report-days/${encodeURIComponent(district)}/${encodeURIComponent(region)}`,
        { headers },
      );
      if (!res.ok) throw new Error(await readFetchErrorMessage(res));
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, districtId, regionId]);

  useEffect(() => {
    if (!apiReady) return;
    void reload();
  }, [apiReady, reload]);

  return { data, loading, error, reload };
}
