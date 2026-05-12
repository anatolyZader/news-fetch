import { useCallback, useEffect, useState } from 'react';

/** @param {{ getIdToken: () => Promise<string|null>, apiReady: boolean }} opts */
export function useReportBotManualReports({ getIdToken, apiReady }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch('/api/report-bot/manual-reports', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (apiReady) void reload();
  }, [apiReady, reload]);

  return { data, loading, error, reload };
}
