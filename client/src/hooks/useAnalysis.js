import { useState, useEffect, useCallback } from 'react';
import { normalizeReportScopeId } from '../lib/reportScopes.js';
import { useAuth } from '../context/AuthContext.jsx';

const LS_REPORT_VIEW = 'resilienceReportView';

/**
 * Loads today's cached report from GET /api/report/today (requires auth when enabled).
 * @param {string} scope report scope id (national | north | south | …)
 * @param {'operator'|'analyst'} [view]
 */
export function useTodayReport(scope = 'national', view = 'operator') {
  const { getIdToken, apiReady } = useAuth();
  const [report, setReport] = useState(null);
  const [markdown, setMarkdown] = useState(null);
  const [scoreBySource, setScoreBySource] = useState(null);
  const [reportDate, setReportDate] = useState(null);
  const [displayView, setDisplayView] = useState(view);
  const [refreshTick, setRefreshTick] = useState(0);
  /** False until the first GET /api/report/today attempt finishes (success or failure). */
  const [initialReportLoadDone, setInitialReportLoadDone] = useState(false);
  const [reportMissingHint, setReportMissingHint] = useState(null);
  const [attentionItems, setAttentionItems] = useState(null);

  useEffect(() => {
    if (!apiReady) return;

    let cancelled = false;

    (async () => {
      setReport(null);
      setMarkdown(null);
      setScoreBySource(null);
      setReportDate(null);
      setDisplayView(view);
      setInitialReportLoadDone(false);
      setReportMissingHint(null);
      setAttentionItems(null);

      const headers = new Headers();
      const t = await getIdToken();
      if (cancelled) return;
      if (t) headers.set('Authorization', `Bearer ${t}`);
      try {
        const params = new URLSearchParams();
        if (scope !== 'national') params.set('scope', scope);
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
          setDisplayView(data.display_view === 'analyst' ? 'analyst' : 'operator');
          setAttentionItems(Array.isArray(data.attention_items) ? data.attention_items : []);
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

  const refreshReport = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    report,
    markdown,
    scoreBySource,
    reportDate,
    displayView,
    refreshReport,
    initialReportLoadDone,
    reportMissingHint,
    attentionItems,
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
