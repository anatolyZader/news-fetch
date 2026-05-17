import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const LS_REPORT_VIEW = 'resilienceReportView';

/**
 * Loads today's cached report from GET /api/report/today (requires auth when enabled).
 * @param {'national'|'north'} scope
 * @param {'operator'|'analyst'} [view]
 */
export function useTodayReport(scope = 'national', view = 'operator') {
  const { getIdToken, apiReady } = useAuth();
  const [report, setReport] = useState(null);
  const [markdown, setMarkdown] = useState(null);
  const [scoreBySource, setScoreBySource] = useState(null);
  const [reportDate, setReportDate] = useState(null);
  const [overridesCount, setOverridesCount] = useState({});
  const [displayView, setDisplayView] = useState(view);
  const [refreshTick, setRefreshTick] = useState(0);
  /** False until the first GET /api/report/today attempt finishes (success or failure). */
  const [initialReportLoadDone, setInitialReportLoadDone] = useState(false);
  const [reportMissingHint, setReportMissingHint] = useState(null);

  useEffect(() => {
    if (!apiReady) return;

    let cancelled = false;
    setReport(null);
    setMarkdown(null);
    setScoreBySource(null);
    setReportDate(null);
    setOverridesCount({});
    setDisplayView(view);
    setInitialReportLoadDone(false);
    setReportMissingHint(null);

    (async () => {
      const headers = new Headers();
      const t = await getIdToken();
      if (cancelled) return;
      if (t) headers.set('Authorization', `Bearer ${t}`);
      try {
        const params = new URLSearchParams();
        if (scope === 'north') params.set('scope', 'north');
        if (view === 'analyst') params.set('view', 'analyst');
        const qs = params.toString() ? `?${params.toString()}` : '';
        const r = await fetch(`/api/report/today${qs}`, { headers });
        const data = await r.json();
        if (cancelled) return;
        if (data.found && data.assessment) {
          setReport(data.assessment);
          setMarkdown(typeof data.markdown === 'string' && data.markdown.trim() ? data.markdown : null);
          setScoreBySource(data.score_by_source && typeof data.score_by_source === 'object' ? data.score_by_source : null);
          setReportDate(typeof data.reportDate === 'string' ? data.reportDate : null);
          setOverridesCount(data.overrides_count && typeof data.overrides_count === 'object' ? data.overrides_count : {});
          setDisplayView(data.display_view === 'analyst' ? 'analyst' : 'operator');
          setReportMissingHint(null);
        } else if (!data.found && data.hint) {
          setReportMissingHint(data.hint);
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
  }, [apiReady, getIdToken, scope, view, refreshTick]);

  /**
   * Re-fetches the report (used after submitting a reviewer override so the
   * overrides_count badge reflects the new total without a full page reload).
   */
  const refreshOverrides = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    report,
    markdown,
    scoreBySource,
    reportDate,
    overridesCount,
    displayView,
    refreshOverrides,
    initialReportLoadDone,
    reportMissingHint,
  };
}

export function readStoredReportView() {
  if (typeof sessionStorage === 'undefined') return 'operator';
  try {
    const v = sessionStorage.getItem(LS_REPORT_VIEW);
    return v === 'analyst' ? 'analyst' : 'operator';
  } catch {
    return 'operator';
  }
}

export function writeStoredReportView(view) {
  try {
    sessionStorage.setItem(LS_REPORT_VIEW, view === 'analyst' ? 'analyst' : 'operator');
  } catch { /* */ }
}
