import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../lib/authFetch.js';
import { withOperatorDistrictQuery } from '../lib/clampOperatorDistrictScope.js';
import { withLang } from '../lib/localeFetch.js';

/**
 * @param {{
 *   getIdToken: () => Promise<string|null>,
 *   getAppCheckToken?: () => Promise<string|null>,
 *   apiReady: boolean,
 *   operatorScope?: string,
 * }} opts
 */
export function useReportBotManualReports({
  getIdToken,
  getAppCheckToken,
  apiReady,
  operatorScope = 'national',
  lang = 'en',
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch(
        withLang(withOperatorDistrictQuery('/api/report-bot/manual-reports', operatorScope), lang),
        { getIdToken, getAppCheckToken },
      );
      setData(json);
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, getAppCheckToken, operatorScope, lang]);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      await reload();
    })();
  }, [apiReady, reload, operatorScope]);

  return { data, loading, error, reload };
}
