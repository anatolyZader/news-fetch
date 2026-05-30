import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const LS_REPORT_VIEW = 'resilienceReportView';

async function fetchTodayReportPayload(scope, view, getIdToken) {
  const headers = new Headers();
  const token = await getIdToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const params = new URLSearchParams();
  if (scope !== 'national') params.set('scope', scope);
  if (view === 'analyst') params.set('view', 'analyst');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await fetch(`/api/report/today${qs}`, { headers });
  return r.json();
}

function applyFoundReport(data, setters) {
  setters.setReport(data.assessment);
  setters.setMarkdown(typeof data.markdown === 'string' && data.markdown.trim() ? data.markdown : null);
  setters.setScoreBySource(data.score_by_source && typeof data.score_by_source === 'object' ? data.score_by_source : null);
  setters.setReportDate(typeof data.reportDate === 'string' ? data.reportDate : null);
  setters.setDisplayView(data.display_view === 'analyst' ? 'analyst' : 'operator');
  setters.setAttentionItems(Array.isArray(data.attention_items) ? data.attention_items : []);
  setters.setReportMissingHint(null);
}

function applyTodayReportPayload(data, setters) {
  if (data.found && data.assessment) {
    applyFoundReport(data, setters);
    return;
  }
  if (!data.found && data.hint) {
    setters.setReportMissingHint(data.hint);
  }
}

function resetTodayReportState(setters, view) {
  setters.setReport(null);
  setters.setMarkdown(null);
  setters.setScoreBySource(null);
  setters.setReportDate(null);
  setters.setDisplayView(view);
  setters.setInitialReportLoadDone(false);
  setters.setReportMissingHint(null);
  setters.setAttentionItems(null);
}

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
    if (!apiReady) return undefined;

    let cancelled = false;
    const setters = {
      setReport,
      setMarkdown,
      setScoreBySource,
      setReportDate,
      setDisplayView,
      setInitialReportLoadDone,
      setReportMissingHint,
      setAttentionItems,
    };

    resetTodayReportState(setters, view);

    (async () => {
      try {
        const data = await fetchTodayReportPayload(scope, view, getIdToken);
        if (cancelled) return;
        applyTodayReportPayload(data, setters);
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
