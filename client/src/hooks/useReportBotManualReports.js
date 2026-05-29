import { useCallback, useEffect, useState } from 'react';
import { withOperatorDistrictQuery } from '../lib/clampOperatorDistrictScope.js';

/** @param {{ getIdToken: () => Promise<string|null>, apiReady: boolean, operatorScope?: string }} opts */
export function useReportBotManualReports({ getIdToken, apiReady, operatorScope = 'national' }) {
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
      const res = await fetch(withOperatorDistrictQuery('/api/report-bot/manual-reports', operatorScope), { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, operatorScope]);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      await reload();
    })();
  }, [apiReady, reload, operatorScope]);

  return { data, loading, error, reload };
}
