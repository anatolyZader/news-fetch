import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const LS_REPORT_VIEW = 'resilienceReportView';
const REPORT_FETCH_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_RETRY_MS = 5_000;

const RETRY_AUTH_CODES = new Set(['missing_token', 'invalid_token', 'token_revoked']);

async function fetchTodayReportPayload(scope, view, accessToken, getIdToken, signal) {
  const params = new URLSearchParams();
  if (scope !== 'national') params.set('scope', scope);
  if (view === 'analyst') params.set('view', 'analyst');
  const qs = params.toString() ? `?${params.toString()}` : '';

  async function attempt(bearerToken) {
    const headers = new Headers();
    if (bearerToken) headers.set('Authorization', `Bearer ${bearerToken}`);
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    const r = await fetch(`/api/report/today${qs}`, { headers, signal });
    const body = await r.json().catch(() => ({}));
    return { r, body };
  }

  let bearerToken = accessToken;
  let { r, body } = await attempt(bearerToken);
  if (r.status === 401 && RETRY_AUTH_CODES.has(body?.code) && getIdToken) {
    bearerToken = await Promise.race([
      getIdToken({ forceRefresh: true }),
      new Promise((resolve) => { setTimeout(() => resolve(null), TOKEN_REFRESH_RETRY_MS); }),
    ]);
    if (bearerToken) {
      ({ r, body } = await attempt(bearerToken));
    }
  }

  if (!r.ok) {
    const err = new Error(
      body?.message || body?.error || `HTTP ${r.status}`,
    );
    err.status = r.status;
    err.code = body?.code;
    throw err;
  }
  return body;
}

function applyFoundReport(data, setters) {
  setters.setReport(data.assessment);
  setters.setMarkdown(typeof data.markdown === 'string' && data.markdown.trim() ? data.markdown : null);
  setters.setScoreBySource(data.score_by_source && typeof data.score_by_source === 'object' ? data.score_by_source : null);
  setters.setReportDate(typeof data.reportDate === 'string' ? data.reportDate : null);
  setters.setDisplayView(data.display_view === 'analyst' ? 'analyst' : 'operator');
  setters.setAttentionItems(Array.isArray(data.attention_items) ? data.attention_items : []);
  setters.setReportMissingHint(null);
  setters.setReportLoadError(null);
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

/**
 * Loads today's cached report from GET /api/report/today (requires auth when enabled).
 * @param {string} scope report scope id (national | north | south | …)
 * @param {'operator'|'analyst'} [view]
 */
export function useTodayReport(scope = 'national', view = 'operator') {
  const {
    getIdToken,
    apiReady,
    authRequired,
    accessToken,
    tokenWarmFailed,
  } = useAuth();
  const getIdTokenRef = useRef(getIdToken);
  getIdTokenRef.current = getIdToken;
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const loadGenRef = useRef(0);

  const reportFetchReady = apiReady && (!authRequired || accessToken || tokenWarmFailed);

  const [report, setReport] = useState(null);
  const [markdown, setMarkdown] = useState(null);
  const [scoreBySource, setScoreBySource] = useState(null);
  const [reportDate, setReportDate] = useState(null);
  const [displayView, setDisplayView] = useState(view);
  const [refreshTick, setRefreshTick] = useState(0);
  const [initialReportLoadDone, setInitialReportLoadDone] = useState(false);
  const [reportMissingHint, setReportMissingHint] = useState(null);
  const [reportLoadError, setReportLoadError] = useState(null);
  const [attentionItems, setAttentionItems] = useState(null);

  useEffect(() => {
    if (!reportFetchReady) return undefined;

    const loadGen = loadGenRef.current + 1;
    loadGenRef.current = loadGen;

    setReport(null);
    setMarkdown(null);
    setScoreBySource(null);
    setReportDate(null);
    setDisplayView(view);
    setInitialReportLoadDone(false);
    setReportMissingHint(null);
    setAttentionItems(null);
    setReportLoadError(null);

    const setters = {
      setReport,
      setMarkdown,
      setScoreBySource,
      setReportDate,
      setDisplayView,
      setInitialReportLoadDone,
      setReportMissingHint,
      setAttentionItems,
      setReportLoadError,
    };

    if (authRequired && tokenWarmFailed && !accessTokenRef.current) {
      setReportLoadError('Could not obtain a session token. Refresh and sign in again.');
      setInitialReportLoadDone(true);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REPORT_FETCH_TIMEOUT_MS);

    void (async () => {
      try {
        const data = await fetchTodayReportPayload(
          scope,
          view,
          accessTokenRef.current,
          (...args) => getIdTokenRef.current(...args),
          controller.signal,
        );
        if (loadGen !== loadGenRef.current) return;
        applyTodayReportPayload(data, setters);
      } catch (err) {
        if (loadGen !== loadGenRef.current) return;
        if (err?.name === 'AbortError') {
          setReportLoadError('Report request timed out. Try refreshing the page.');
        } else if (err?.code === 'missing_token' || err?.code === 'invalid_token' || err?.code === 'token_revoked') {
          setReportLoadError('Session expired or not signed in. Refresh and sign in again.');
        } else if (err?.status === 403) {
          setReportLoadError(err?.message ?? 'You do not have access to this report scope.');
        } else if (err?.code === 'invalid_app_check') {
          setReportLoadError('Security verification failed. Refresh the page and try again.');
        } else {
          setReportLoadError(err?.message ?? 'Could not load the report.');
        }
      } finally {
        clearTimeout(timeoutId);
        if (loadGen === loadGenRef.current) {
          setInitialReportLoadDone(true);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [reportFetchReady, authRequired, accessToken, tokenWarmFailed, scope, view, refreshTick]);

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
    reportLoadError,
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
