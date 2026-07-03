import { useCallback, useEffect, useState } from 'react';
import { localizedAuthFetch } from '../lib/localizedAuthFetch.js';

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

/** Load daily regional PBO markdown reports (`/api/pbo/regional-report-days/:districtId/:regionId`). */
export function useRegionalPboReports({
  districtId = 'north',
  regionId,
  lang = 'en',
  getIdToken,
  getAppCheckToken,
  apiReady,
}) {
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
      const json = await localizedAuthFetch(
        `/api/pbo/regional-report-days/${encodeURIComponent(district)}/${encodeURIComponent(region)}`,
        { lang, getIdToken, getAppCheckToken },
      );
      setData(json);
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, getAppCheckToken, districtId, regionId, lang]);

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
