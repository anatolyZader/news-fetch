import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Loads today's cached report from GET /api/report/today (requires auth when enabled).
 */
export function useTodayReport(scope = 'national') {
  const { getIdToken, apiReady } = useAuth();
  const [report, setReport] = useState(null);
  const [markdown, setMarkdown] = useState(null);
  const [scoreBySource, setScoreBySource] = useState(null);
  const [reportDate, setReportDate] = useState(null);
  /** False until the first GET /api/report/today attempt finishes (success or failure). */
  const [initialReportLoadDone, setInitialReportLoadDone] = useState(false);

  useEffect(() => {
    if (!apiReady) return;

    let cancelled = false;
    setReport(null);
    setMarkdown(null);
    setScoreBySource(null);
    setReportDate(null);
    setInitialReportLoadDone(false);

    (async () => {
      const headers = new Headers();
      const t = await getIdToken();
      if (cancelled) return;
      if (t) headers.set('Authorization', `Bearer ${t}`);
      try {
        const query = scope === 'north' ? '?scope=north' : '';
        const r = await fetch(`/api/report/today${query}`, { headers });
        const data = await r.json();
        if (cancelled) return;
        if (data.found && data.assessment) {
          setReport(data.assessment);
          setMarkdown(typeof data.markdown === 'string' && data.markdown.trim() ? data.markdown : null);
          setScoreBySource(data.score_by_source && typeof data.score_by_source === 'object' ? data.score_by_source : null);
          setReportDate(typeof data.reportDate === 'string' ? data.reportDate : null);
        }
      } catch {
        /* offline / error — empty state below */
      } finally {
        if (!cancelled) setInitialReportLoadDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiReady, getIdToken, scope]);

  return { report, markdown, scoreBySource, reportDate, initialReportLoadDone };
}
