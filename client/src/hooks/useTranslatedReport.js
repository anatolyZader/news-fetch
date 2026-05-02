import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Returns a translated version of the report when lang !== 'en'.
 * Translations are cached server-side (disk) and shared across all users.
 *
 * We depend on `report?.date` rather than the full `report` object so that
 * a new object reference for the same report (React re-render) does not
 * cancel an in-flight translation fetch.
 */
export function useTranslatedReport(report, lang) {
  const { getIdToken } = useAuth();
  // Keep unstable references in refs so they never re-trigger the effect
  const getIdTokenRef = useRef(getIdToken);
  getIdTokenRef.current = getIdToken;
  const reportRef = useRef(report);
  reportRef.current = report;

  const [translated, setTranslated] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(null);

  const reportDate = report?.date ?? null;
  const reportScope = report?.report_scope?.id ?? 'national';
  const articleCount = report?.total_articles_analyzed ?? 0;

  useEffect(() => {
    if (!reportDate || lang === 'en') {
      setTranslated(null);
      setTranslateError(null);
      setTranslating(false);
      return;
    }

    setTranslated(null);
    setTranslateError(null);
    setTranslating(true);

    let cancelled = false;

    (async () => {
      try {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        const token = await getIdTokenRef.current();
        if (token) headers.set('Authorization', `Bearer ${token}`);

        const r = await fetch('/api/translate', {
          method: 'POST',
          headers,
          body: JSON.stringify({ report: reportRef.current, lang }),
        });
        if (!r.ok) {
          const errBody = await r.json().catch(() => ({}));
          throw new Error(errBody.error ?? `HTTP ${r.status}`);
        }
        const data = await r.json();
        if (!cancelled) {
          if (data.report) {
            setTranslated(data.report);
          } else {
            setTranslateError('Empty translation response');
          }
        }
      } catch (e) {
        console.error('[useTranslatedReport]', e);
        if (!cancelled) setTranslateError(e?.message ?? 'Translation failed');
      } finally {
        if (!cancelled) setTranslating(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate, reportScope, articleCount, lang]);

  return { displayReport: translated ?? report, translating, translateError };
}
