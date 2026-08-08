import { useCallback, useEffect, useState } from 'react';
import { localizedAuthFetch } from '../lib/localizedAuthFetch.js';
import { withUserDistrictQuery } from '../lib/clampUserDistrictScope.js';

/**
 * @param {{
 *   getIdToken: () => Promise<string|null>,
 *   getAppCheckToken?: () => Promise<string|null>,
 *   apiReady: boolean,
 *   userScope?: string,
 * }} opts
 */
export function useReportBotManualReports({
  getIdToken,
  getAppCheckToken,
  apiReady,
  userScope = 'national',
  lang = 'en',
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await localizedAuthFetch(
        withUserDistrictQuery('/api/report-bot/manual-reports', userScope),
        { lang, getIdToken, getAppCheckToken },
      );
      setData(json);
    } catch (e) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, getAppCheckToken, userScope, lang]);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      await reload();
    })();
  }, [apiReady, reload, userScope]);

  return { data, loading, error, reload };
}
