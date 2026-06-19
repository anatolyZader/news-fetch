import { useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch } from '../lib/authFetch.js';
import { withLang } from '../lib/localeFetch.js';
import { normalizeIsraelDistrictId } from '../lib/israelDistricts.js';

/**
 * @param {{ districtId?: string, getIdToken?: () => Promise<string|null>, getAppCheckToken?: () => Promise<string|null>, apiReady?: boolean }} [opts]
 */
export function useMunicipalitiesData({ districtId = 'north', lang = 'en', getIdToken, getAppCheckToken, apiReady } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedMuni, setSelectedMuni] = useState(null);
  const district = normalizeIsraelDistrictId(districtId);
  const scopedDistrict = district === 'national' ? 'north' : district;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ district: scopedDistrict });
      const json = await authFetch(withLang(`/api/municipalities?${params.toString()}`, lang), {
        getIdToken,
        getAppCheckToken,
      });
      setData(json);
      if (json.days?.length) setSelectedDate(json.days[json.days.length - 1].date);
      else setSelectedDate(null);
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, getAppCheckToken, scopedDistrict, lang]);

  useEffect(() => {
    if (!apiReady) return undefined;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [apiReady, load]);

  const day = useMemo(() => {
    if (!data?.days || !selectedDate) return null;
    return data.days.find((d) => d.date === selectedDate) ?? null;
  }, [data, selectedDate]);

  const muniAllDays = useMemo(() => {
    if (!data?.days || !selectedMuni) return [];
    return data.days.map((d) => {
      const municipality = d.municipalities.find((m) => m.name === selectedMuni);
      return municipality ? { date: d.date, ...municipality } : null;
    }).filter(Boolean);
  }, [data, selectedMuni]);

  const muniDay = useMemo(() => {
    if (!day || !selectedMuni) return null;
    return day.municipalities.find((m) => m.name === selectedMuni) ?? null;
  }, [day, selectedMuni]);

  const districtAvg = useMemo(() => {
    if (!data?.districtTrend || !selectedDate) return null;
    return data.districtTrend.find((d) => d.date === selectedDate)?.avgByComponent ?? null;
  }, [data, selectedDate]);

  const visibleMunicipalities = useMemo(() => {
    const list = day?.municipalities ?? [];
    return list.filter((m) => {
      const name = String(m?.name ?? '').trim();
      if (!name) return false;
      return !/^\s*applied\s+filters\b/i.test(name);
    });
  }, [day]);

  const selectDate = useCallback((date) => {
    setSelectedDate(date);
    setSelectedMuni(null);
  }, []);

  return {
    data,
    loading,
    error,
    selectedDate,
    setSelectedDate: selectDate,
    selectedMuni,
    setSelectedMuni,
    day,
    muniAllDays,
    muniDay,
    districtAvg,
    visibleMunicipalities,
    reload: load,
  };
}
