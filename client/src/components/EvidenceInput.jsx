import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import styles from './EvidenceInput.module.css';

const STORAGE_KEY = 'communityResilienceEvidenceDraft';
const SAVE_DEBOUNCE_MS = 400;
const MAX_CHARS = 500_000;
const STALE_AFTER_MS = 10_000;
const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 15_000;
const URL_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+/i;

function readDraft() {
  try {
    const fromLocal = localStorage.getItem(STORAGE_KEY);
    if (fromLocal != null) return fromLocal;
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    if (fromSession != null) {
      localStorage.setItem(STORAGE_KEY, fromSession);
      sessionStorage.removeItem(STORAGE_KEY);
      return fromSession;
    }
    return '';
  } catch {
    return '';
  }
}

function writeDraft(text) {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    /* ignore quota / private mode */
  }
}

function clearDraftCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function formatSavedTime(isoLike) {
  if (!isoLike) return '';
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}


export function EvidenceInput() {
  const { getIdToken, apiReady } = useAuth();
  const { t } = useLanguage();
  const [value, setValue] = useState(readDraft);
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [sending, setSending] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [lastCategory, setLastCategory] = useState(null);
  const [ingestNote, setIngestNote] = useState('');
  const [analysisNote, setAnalysisNote] = useState('');
  const [lastServerSavedAt, setLastServerSavedAt] = useState('');
  const [isUnsyncedStale, setIsUnsyncedStale] = useState(false);
  const lastSyncedRef = useRef(null);
  const retryRef = useRef({ timerId: null, attempts: 0, content: '' });
  const saveInFlightRef = useRef(false);
  const unsyncedSinceRef = useRef(0);
  const submissionPollRef = useRef({ timerId: null, submissionId: null });

  const fetchEvidence = useCallback(async () => {
    const headers = new Headers();
    const t = await getIdToken();
    if (t) headers.set('Authorization', `Bearer ${t}`);
    const r = await fetch('/api/evidence-draft', { headers });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
  }, [getIdToken]);

  const putEvidence = useCallback(
    async (content) => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);
      const r = await fetch('/api/evidence-draft', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    [getIdToken],
  );

  const cancelRetry = useCallback(() => {
    if (retryRef.current.timerId) {
      clearTimeout(retryRef.current.timerId);
      retryRef.current.timerId = null;
    }
    retryRef.current.attempts = 0;
    retryRef.current.content = '';
  }, []);

  const cancelSubmissionPoll = useCallback(() => {
    if (submissionPollRef.current.timerId) {
      clearTimeout(submissionPollRef.current.timerId);
      submissionPollRef.current.timerId = null;
    }
    submissionPollRef.current.submissionId = null;
  }, []);

  const persistDraft = useCallback(
    async (content, fromRetry = false) => {
      if (saveInFlightRef.current) return false;
      saveInFlightRef.current = true;
      try {
        setSyncError(null);
        const saved = await putEvidence(content);
        lastSyncedRef.current = content;
        setLastServerSavedAt(saved?.updatedAt ?? new Date().toISOString());
        setIsUnsyncedStale(false);
        clearDraftCache();
        if (fromRetry) cancelRetry();
        return true;
      } catch (e) {
        setSyncError(e?.message ?? 'Could not save draft');
        return false;
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [putEvidence, cancelRetry],
  );

  const scheduleRetry = useCallback(
    (content) => {
      retryRef.current.content = content;
      const attempts = retryRef.current.attempts;
      const waitMs = Math.min(RETRY_BASE_MS * 2 ** attempts, RETRY_MAX_MS);
      if (retryRef.current.timerId) clearTimeout(retryRef.current.timerId);
      retryRef.current.timerId = setTimeout(async () => {
        retryRef.current.timerId = null;
        retryRef.current.attempts += 1;
        const ok = await persistDraft(retryRef.current.content, true);
        if (!ok) scheduleRetry(retryRef.current.content);
      }, waitMs);
    },
    [persistDraft],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (value !== lastSyncedRef.current) {
      writeDraft(value);
    }
  }, [value, hydrated]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    setSyncError(null);

    (async () => {
      try {
        const data = await fetchEvidence();
        if (cancelled) return;
        const local = readDraft();
        const serverText = typeof data.content === 'string' ? data.content : '';

        if (serverText.trim().length > 0) {
          setValue(serverText);
          lastSyncedRef.current = serverText;
          setLastServerSavedAt(data?.updatedAt ?? '');
          clearDraftCache();
        } else if (local.trim().length > 0) {
          await persistDraft(local);
          if (cancelled) return;
          setValue(local);
        } else {
          lastSyncedRef.current = serverText;
          setLastServerSavedAt(data?.updatedAt ?? '');
        }
      } catch (e) {
        if (!cancelled) setSyncError(e?.message ?? 'Could not load draft from server');
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiReady, fetchEvidence, persistDraft]);

  useEffect(() => {
    if (!apiReady || !hydrated) return;
    if (value.length > MAX_CHARS) return;

    const id = setTimeout(() => {
      if (value === lastSyncedRef.current) return;
      (async () => {
        const ok = await persistDraft(value);
        if (!ok) scheduleRetry(value);
      })();
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(id);
  }, [value, apiReady, hydrated, persistDraft, scheduleRetry]);

  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(() => {
      const unsynced = value !== lastSyncedRef.current;
      if (!unsynced) {
        unsyncedSinceRef.current = 0;
        setIsUnsyncedStale(false);
        return;
      }
      if (!unsyncedSinceRef.current) unsyncedSinceRef.current = Date.now();
      const base =
        (lastServerSavedAt ? new Date(lastServerSavedAt).getTime() : 0) || unsyncedSinceRef.current;
      setIsUnsyncedStale(Date.now() - base > STALE_AFTER_MS);
    }, 1000);
    return () => clearInterval(id);
  }, [value, hydrated, lastServerSavedAt]);

  useEffect(() => () => cancelRetry(), [cancelRetry]);
  useEffect(() => () => cancelSubmissionPoll(), [cancelSubmissionPoll]);

  const fetchSubmissionStatus = useCallback(
    async (submissionId) => {
      const headers = new Headers();
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);
      const r = await fetch(`/api/evidence-submissions/${submissionId}`, { headers });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    [getIdToken],
  );


  const pollSubmissionUntilDone = useCallback(
    async (submissionId) => {
      try {
        const data = await fetchSubmissionStatus(submissionId);
        const submission = data?.submission;
        if (!submission) throw new Error('Missing submission status payload');
        if (submission.ingestStatus === 'failed') {
          setIngestNote(`Ingest failed: ${submission.ingestDetails ?? 'unknown reason'}`);
        } else if (submission.ingestStatus === 'processed') {
          setIngestNote('Ingest complete.');
        } else {
          setIngestNote('Ingest in progress…');
        }

        if (submission.analysisStatus === 'failed') {
          setAnalysisNote(`8-component analysis failed: ${submission.analysisDetails ?? 'unknown reason'}`);
          cancelSubmissionPoll();
          return;
        }
        if (submission.analysisStatus === 'processed') {
          const isTextOnly = !submission.extractedContentJson;
          setAnalysisNote(isTextOnly ? 'Stored as evidence.' : '8-component analysis complete — view in Submissions tab.');
          cancelSubmissionPoll();
          return;
        }
        setAnalysisNote('8-component analysis in progress…');
        submissionPollRef.current.timerId = setTimeout(() => {
          void pollSubmissionUntilDone(submissionId);
        }, 2000);
      } catch (err) {
        setAnalysisNote(`Status check failed: ${err?.message ?? 'unknown error'}`);
        submissionPollRef.current.timerId = setTimeout(() => {
          void pollSubmissionUntilDone(submissionId);
        }, 3000);
      }
    },
    [cancelSubmissionPoll, fetchSubmissionStatus],
  );

  const handleSend = useCallback(async () => {
    if (sending || !hydrated) return;
    const submittedContent = value;
    const hasUrl = URL_REGEX.test(submittedContent);
    setSending(true);
    setSyncError(null);
    setSavedOk(false);
    setLastCategory(null);
    setIngestNote('');
    setAnalysisNote('');
    // UX: clear input immediately on send
    setValue('');
    lastSyncedRef.current = '';
    clearDraftCache();
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);

      const r = await fetch('/api/evidence-submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: submittedContent }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }

      const data = await r.json();
      if (typeof data?.draft?.content === 'string') {
        // Keep input cleared after send.
        lastSyncedRef.current = '';
        setLastServerSavedAt(data?.draft?.updatedAt ?? new Date().toISOString());
        clearDraftCache();
      } else {
        lastSyncedRef.current = '';
        setLastServerSavedAt(new Date().toISOString());
      }
      cancelRetry();
      if (typeof data?.submission?.category === 'string') {
        setLastCategory(data.submission.category);
      }
      if (hasUrl && data?.queued && Number.isFinite(Number(data?.submission?.id))) {
        const submissionId = Number(data.submission.id);
        setIngestNote(`Submission #${submissionId} queued for ingest.`);
        setAnalysisNote('8-component analysis queued…');
        cancelSubmissionPoll();
        submissionPollRef.current.submissionId = submissionId;
        void pollSubmissionUntilDone(submissionId);
      }
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setSyncError(e?.message ?? 'Could not save');
      // Restore text if submit failed.
      setValue(submittedContent);
      lastSyncedRef.current = submittedContent;
      writeDraft(submittedContent);
    } finally {
      setSending(false);
    }
  }, [sending, hydrated, value, getIdToken, cancelSubmissionPoll, pollSubmissionUntilDone]);


  return (
    <section className={styles.section} aria-labelledby="evidence-heading">
      <h2 id="evidence-heading" className={styles.heading}>
        {t('evidence.heading')}
      </h2>
      <p className={styles.intro}>
        {t('evidence.intro')}
      </p>
      {syncError && (
        <p className={styles.syncError} role="alert">
          {syncError}
        </p>
      )}
      <label htmlFor="evidence-textarea" className={styles.visuallyHidden}>
        {t('evidence.heading')}
      </label>
      <textarea
        id="evidence-textarea"
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
        placeholder={t('evidence.placeholder')}
        rows={6}
        spellCheck
        maxLength={MAX_CHARS}
        disabled={!hydrated}
      />
      {!hydrated && <p className={styles.syncHint}>{t('evidence.loading')}</p>}
      <div className={styles.footer}>
        {savedOk && <span className={styles.savedOk}>{t('evidence.savedOk')}</span>}
        {lastServerSavedAt && (
          <span className={styles.serverSaved}>
            {t('evidence.savedAt').replace('{time}', formatSavedTime(lastServerSavedAt))}
          </span>
        )}
        {isUnsyncedStale && <span className={styles.syncStale}>{t('evidence.unsynced')}</span>}
        {savedOk && lastCategory === 'url_to_important_evidence' && (
          <span className={styles.savedOk}>Categorized: important evidence URL</span>
        )}
        {savedOk && lastCategory === 'single_evidence_piece' && (
          <span className={styles.savedOk}>Categorized: single evidence piece</span>
        )}
        {ingestNote && <span className={styles.savedOk}>{ingestNote}</span>}
        {analysisNote && <span className={styles.serverSaved}>{analysisNote}</span>}
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!hydrated || sending}
        >
          {sending ? t('evidence.saving') : t('evidence.send')}
        </button>
      </div>

    </section>
  );
}
