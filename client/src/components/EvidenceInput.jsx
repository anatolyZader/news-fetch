import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './EvidenceInput.module.css';

const STORAGE_KEY = 'communityResilienceEvidenceDraft';
const SAVE_DEBOUNCE_MS = 800;
const MAX_CHARS = 500_000;

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

export function EvidenceInput() {
  const { getIdToken, apiReady } = useAuth();
  const [value, setValue] = useState(readDraft);
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const lastSyncedRef = useRef(null);

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

  useEffect(() => {
    writeDraft(value);
  }, [value]);

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
          writeDraft(serverText);
          lastSyncedRef.current = serverText;
        } else if (local.trim().length > 0) {
          await putEvidence(local);
          if (cancelled) return;
          lastSyncedRef.current = local;
        } else {
          lastSyncedRef.current = serverText;
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
  }, [apiReady, fetchEvidence, putEvidence]);

  useEffect(() => {
    if (!apiReady || !hydrated) return;
    if (value.length > MAX_CHARS) return;

    const id = setTimeout(() => {
      if (value === lastSyncedRef.current) return;
      (async () => {
        try {
          setSyncError(null);
          await putEvidence(value);
          lastSyncedRef.current = value;
        } catch (e) {
          setSyncError(e?.message ?? 'Could not save draft');
        }
      })();
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(id);
  }, [value, apiReady, hydrated, putEvidence]);

  return (
    <section className={styles.section} aria-labelledby="evidence-heading">
      <h2 id="evidence-heading" className={styles.heading}>
        Report evidence
      </h2>
      <p className={styles.intro}>
        Add notes, observations, or paste links to articles, videos, or other sources you want on the record.
      </p>
      {syncError && (
        <p className={styles.syncError} role="alert">
          {syncError}
        </p>
      )}
      <label htmlFor="evidence-textarea" className={styles.visuallyHidden}>
        Evidence text and links
      </label>
      <textarea
        id="evidence-textarea"
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
        placeholder="Example: Saw a report about shelter behavior in… https://…"
        rows={6}
        spellCheck
        maxLength={MAX_CHARS}
        disabled={!hydrated}
      />
      {!hydrated && <p className={styles.syncHint}>Loading draft…</p>}
    </section>
  );
}
