import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './ReportBuildPanel.module.css';

async function postJson(url, body, { token } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export function ReportBuildPanel({ open, onClose }) {
  const { getIdToken } = useAuth();
  const overlayRef = useRef(null);

  const [input, setInput] = useState('');
  const [state, setState] = useState('collecting');
  const [questions, setQuestions] = useState([]);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  const resetUi = useCallback(() => {
    setInput('');
    setState('collecting');
    setQuestions([]);
    setPreview('');
    setError(null);
    setSuccess('');
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      const token = await getIdToken();
      await postJson('/api/report-build/start', {}, { token });
      setState('collecting');
      setQuestions([]);
      setPreview('');
    } catch (e) {
      setError(e?.message ?? 'Failed to start report builder');
    } finally {
      setBusy(false);
    }
  }, [getIdToken]);

  const cancel = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken();
      await postJson('/api/report-build/cancel', {}, { token });
      resetUi();
      onClose?.();
    } catch (e) {
      setError(e?.message ?? 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  }, [getIdToken, onClose, resetUi]);

  const sendTurn = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      const token = await getIdToken();
      const out = await postJson('/api/report-build/turn', { text }, { token });
      setInput('');
      setState(out?.state ?? 'collecting');
      setQuestions(Array.isArray(out?.followupQuestions) ? out.followupQuestions : []);
      setPreview(typeof out?.draftPreview === 'string' ? out.draftPreview : '');
    } catch (e) {
      setError(e?.message ?? 'Failed to send');
    } finally {
      setBusy(false);
    }
  }, [input, busy, getIdToken]);

  const confirmAndSubmit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      const token = await getIdToken();
      const confirmed = await postJson('/api/report-build/confirm', {}, { token });
      const draftText = String(confirmed?.draftText ?? '').trim();
      if (!draftText) throw new Error('No draft available to submit');

      await postJson('/api/evidence-submit', { content: draftText }, { token });

      setSuccess('Report submitted as evidence.');
      setQuestions([]);
      setPreview('');
      setState('collecting');
    } catch (e) {
      setError(e?.message ?? 'Failed to submit');
    } finally {
      setBusy(false);
    }
  }, [busy, getIdToken]);

  useEffect(() => {
    if (!open) return;
    resetUi();
    void start();
  }, [open, resetUi, start]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Write report"
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose?.();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>Write report</div>
          <div className={styles.headerRight}>
            <button type="button" className={styles.secondary} onClick={() => void start()} disabled={busy}>
              Restart
            </button>
            <button type="button" className={styles.close} onClick={cancel} disabled={busy}>
              Close
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.hint}>
            Write freely. The assistant will ask for missing details and then generate a concise draft for approval.
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {success && <div className={styles.success}>{success}</div>}

          <textarea
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={state === 'confirming' ? 'Add an edit or extra detail…' : 'Describe what you saw / heard…'}
            disabled={busy}
          />

          <div className={styles.row}>
            <button type="button" className={styles.primary} onClick={sendTurn} disabled={busy || !input.trim()}>
              {state === 'confirming' ? 'Update draft' : 'Next'}
            </button>
            {preview && (
              <button type="button" className={styles.primary} onClick={confirmAndSubmit} disabled={busy}>
                Confirm & submit
              </button>
            )}
          </div>

          {questions.length > 0 && !preview && (
            <div className={styles.questions}>
              <div className={styles.questionsTitle}>Follow-up questions</div>
              {questions.map((q, i) => (
                <div key={`${i}-${q}`} className={styles.questionItem}>
                  {i + 1}. {q}
                </div>
              ))}
            </div>
          )}

          {preview && (
            <>
              <div className={styles.questionsTitle}>Draft preview</div>
              <div className={styles.preview}>{preview}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

