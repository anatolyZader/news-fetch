import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Loads today's cached report from GET /api/report/today (requires auth when enabled).
 */
export function useTodayReport() {
  const { getIdToken, apiReady } = useAuth();
  const [report, setReport] = useState(null);
  const [markdown, setMarkdown] = useState(null);
  const [costUsd, setCostUsd] = useState(null);
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [scoreBySource, setScoreBySource] = useState(null);
  const [reportDate, setReportDate] = useState(null);
  /** False until the first GET /api/report/today attempt finishes (success or failure). */
  const [initialReportLoadDone, setInitialReportLoadDone] = useState(false);

  useEffect(() => {
    if (!apiReady) return;

    (async () => {
      const headers = new Headers();
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);
      try {
        const r = await fetch('/api/report/today', { headers });
        const data = await r.json();
        if (data.found && data.assessment) {
          setReport(data.assessment);
          setCostUsd(typeof data.costUsd === 'number' ? data.costUsd : null);
          setCostBreakdown(data.costBreakdown && typeof data.costBreakdown === 'object' ? data.costBreakdown : null);
          setMarkdown(typeof data.markdown === 'string' && data.markdown.trim() ? data.markdown : null);
          setScoreBySource(data.score_by_source && typeof data.score_by_source === 'object' ? data.score_by_source : null);
          setReportDate(typeof data.reportDate === 'string' ? data.reportDate : null);
        }
      } catch {
        /* offline / error — empty state below */
      } finally {
        setInitialReportLoadDone(true);
      }
    })();
  }, [apiReady, getIdToken]);

  return { report, markdown, costUsd, costBreakdown, scoreBySource, reportDate, initialReportLoadDone };
}
