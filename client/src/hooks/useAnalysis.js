import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const REPORT_FETCH_TIMEOUT_MS = 15_000;
const REPORT_FETCH_TIMEOUT_TRANSLATE_MS = 120_000;
const TOKEN_REFRESH_RETRY_MS = 5_000;

const RETRY_AUTH_CODES = new Set(['missing_token', 'invalid_token', 'token_revoked']);

async function fetchTodayReportPayload(scope, accessToken, getIdToken, signal, selectedEdition, lang) {
  const params = new URLSearchParams();
  if (scope !== 'national') params.set('scope', scope);
  if (selectedEdition?.date) params.set('date', selectedEdition.date);
  if (selectedEdition?.run_id) params.set('run', selectedEdition.run_id);
  if (lang && lang !== 'en') params.set('lang', lang);
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
  setters.setReportGeneratedAt(typeof data.generated_at === 'string' ? data.generated_at : null);
  setters.setAssessmentWindow(
    data.assessment_window && typeof data.assessment_window === 'object'
      ? data.assessment_window
      : null,
  );
  setters.setBudgetStatus(data.budget_status ?? null);
  setters.setSuggestCrisisBudget(data.suggest_crisis_budget === true);
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
 * @param {import('../lib/reportEditionFormat.js').ReportEditionSelection} [selectedEdition]
 */
export function useTodayReport(scope = 'national', selectedEdition = null, lang = 'en') {
  const {
    getIdToken,
    apiReady,
    authRequired,
    accessToken,
    tokenWarmFailed,
  } = useAuth();
  const getIdTokenRef = useRef(getIdToken);
  const accessTokenRef = useRef(accessToken);
  const loadGenRef = useRef(0);

  useLayoutEffect(() => {
    getIdTokenRef.current = getIdToken;
    accessTokenRef.current = accessToken;
  });

  const reportFetchReady = apiReady && (!authRequired || accessToken || tokenWarmFailed);

  const [report, setReport] = useState(null);
  const [markdown, setMarkdown] = useState(null);
  const [scoreBySource, setScoreBySource] = useState(null);
  const [reportDate, setReportDate] = useState(null);
  const [reportGeneratedAt, setReportGeneratedAt] = useState(null);
  const [assessmentWindow, setAssessmentWindow] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [initialReportLoadDone, setInitialReportLoadDone] = useState(false);
  const [reportMissingHint, setReportMissingHint] = useState(null);
  const [reportLoadError, setReportLoadError] = useState(null);
  const [budgetStatus, setBudgetStatus] = useState(null);
  const [suggestCrisisBudget, setSuggestCrisisBudget] = useState(false);
  const [reportLocalizing, setReportLocalizing] = useState(false);

  const editionDate = selectedEdition?.date ?? null;
  const editionRunId = selectedEdition?.run_id ?? null;

  useEffect(() => {
    if (!reportFetchReady) return undefined;

    const loadGen = loadGenRef.current + 1;
    loadGenRef.current = loadGen;

    const setters = {
      setReport,
      setMarkdown,
      setScoreBySource,
      setReportDate,
      setReportGeneratedAt,
      setAssessmentWindow,
      setInitialReportLoadDone,
      setReportMissingHint,
      setBudgetStatus,
      setSuggestCrisisBudget,
      setReportLoadError,
    };

    const controller = new AbortController();
    const fetchTimeoutMs = lang === 'en' ? REPORT_FETCH_TIMEOUT_MS : REPORT_FETCH_TIMEOUT_TRANSLATE_MS;
    const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);
    let localizingTimer = null;
    if (lang === 'en') {
      // English loads skip the delayed "localizing" banner.
    } else {
      localizingTimer = setTimeout(() => {
        if (loadGen === loadGenRef.current) setReportLocalizing(true);
      }, 800);
    }

    void (async () => {
      setReport(null);
      setMarkdown(null);
      setScoreBySource(null);
      setReportDate(null);
      setReportGeneratedAt(null);
      setAssessmentWindow(null);
      setInitialReportLoadDone(false);
      setReportMissingHint(null);
      setBudgetStatus(null);
      setSuggestCrisisBudget(false);
      setReportLoadError(null);

      if (authRequired && tokenWarmFailed && !accessTokenRef.current) {
        setReportLoadError('Could not obtain a session token. Refresh and sign in again.');
        setInitialReportLoadDone(true);
        return;
      }

      try {
        const data = await fetchTodayReportPayload(
          scope,
          accessTokenRef.current,
          (...args) => getIdTokenRef.current(...args),
          controller.signal,
          editionDate ? { date: editionDate, run_id: editionRunId || null } : null,
          lang,
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
        if (localizingTimer) clearTimeout(localizingTimer);
        if (loadGen === loadGenRef.current) {
          setInitialReportLoadDone(true);
          setReportLocalizing(false);
        }
      }
    })();

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
      if (localizingTimer) clearTimeout(localizingTimer);
      setReportLocalizing(false);
    };
  }, [reportFetchReady, authRequired, accessToken, tokenWarmFailed, scope, editionDate, editionRunId, lang, refreshTick]);

  const refreshReport = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    report,
    markdown,
    scoreBySource,
    reportDate,
    reportGeneratedAt,
    assessmentWindow,
    refreshReport,
    initialReportLoadDone,
    reportMissingHint,
    reportLoadError,
    budgetStatus,
    suggestCrisisBudget,
    reportLocalizing,
  };
}

/**
 * Fetch available report editions for a scope from GET /api/report/dates.
 * @param {string} scope
 * @param {string|null} accessToken
 * @returns {{ editions: object[], dates: string[], loading: boolean }}
 */
export function useReportEditions(scope, accessToken) {
  const [editions, setEditions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    const params = new URLSearchParams();
    if (scope !== 'national') params.set('scope', scope);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const headers = new Headers();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    fetch(`/api/report/dates${qs}`, { headers })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (Array.isArray(body?.editions) && body.editions.length > 0) {
          setEditions(body.editions);
          return;
        }
        const dates = Array.isArray(body?.dates) ? body.dates : [];
        setEditions(dates.map((date) => ({ date })));
      })
      .catch(() => { if (!cancelled) setEditions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, accessToken]);

  const dates = editions.map((e) => e.date);
  return { editions, dates, loading };
}

/** @deprecated use useReportEditions */
export function useReportDates(scope, accessToken) {
  const { dates, loading } = useReportEditions(scope, accessToken);
  return { dates, loading };
}

