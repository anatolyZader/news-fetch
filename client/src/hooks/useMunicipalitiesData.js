import { useCallback, useEffect, useMemo, useState } from 'react';

export function useMunicipalitiesData({ getIdToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDateState] = useState(null);
  const [selectedMuni, setSelectedMuni] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch('/api/municipalities', { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
      if (json.days?.length) setSelectedDateState(json.days[json.days.length - 1].date);
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      await load();
    })();
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

  const setSelectedDate = useCallback((date) => {
    setSelectedDateState(date);
    setSelectedMuni(null);
  }, []);

  return {
    data,
    loading,
    error,
    selectedDate,
    setSelectedDate,
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
