import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './ReportBuildPanel.module.css';

function hasSourceBasisCue(text) {
  const t = String(text ?? '').toLowerCase();
  if (/\b(i saw|i see|i observed|i witnessed)\b/.test(t)) return true;
  if (/[א-ת]ראיתי|תצפית|תצפיתי/.test(t)) return true;
  if (/\b(staff|team|guard|security|municipality|welfare)\b/.test(t)) return true;
  if (/צוות|מאבטח|אבטחה|עירייה|רווחה|שוטר/.test(t)) return true;
  if (/\b(residents|people told|they told me|locals said)\b/.test(t)) return true;
  if (/תושבים|אמרו לי|סיפרו לי|לדבריהם/.test(t)) return true;
  return false;
}

function hasSpreadCue(text) {
  const t = String(text ?? '').toLowerCase();
  if (/\b(\d+|dozens|hundreds|many|most|few|massively)\b/.test(t)) return true;
  if (/[0-9]+|עשרות|מאות|רבים|מרבית|מעטים|המון/.test(t)) return true;
  if (/\b(isolated|widespread|across|throughout)\b/.test(t)) return true;
  if (/בודד|נקודתי|נרחב|בכל|ברחבי/.test(t)) return true;
  return false;
}

function hasLocalityCue(text) {
  const s = String(text ?? '').trim();
  if (!s) return false;
  // crude heuristic: any mention of a known-ish place token (Hebrew/English) or "in <place>"
  if (/\bin\s+[A-Za-z][A-Za-z\s-]{2,}\b/.test(s)) return true;
  if (/[א-ת]{3,}/.test(s)) return true; // some Hebrew word (often locality)
  return false;
}

function hasConcreteExampleCue(text) {
  const t = String(text ?? '').toLowerCase();
  if (/\b(saw|see|heard|found|entered|refused|ignored|ran|shelter|alert)\b/.test(t)) return true;
  if (/ראיתי|שמעתי|נכנסו|לא נכנסו|התעלמו|אזעקה|ממ\"ד|מקלט|מרחב מוגן/.test(t)) return true;
  return false;
}

function buildHeuristicQuestions(text) {
  const t = String(text ?? '').trim();
  if (!t || t.length < 8) return [];
  const qs = [];
  if (!hasConcreteExampleCue(t)) qs.push('מה בדיוק ראית או שמעת? כמה דוגמאות קונקרטיות.');
  if (!hasLocalityCue(t)) qs.push('באיזה יישוב או אזור מדובר?');
  if (!hasSourceBasisCue(t)) qs.push('האם זו תצפית ישירה שלך, דיווח מצוות מקומי, או מה שתושבים סיפרו?');
  if (!hasSpreadCue(t)) qs.push('זה מקרה בודד, תופעה באזור מוגדר, או רחבה יותר?');
  return qs.slice(0, 3);
}

function stripParentheticals(text) {
  // Presentation-only: remove parenthetical explanations like "(why ...)".
  const s = String(text ?? '');
  // Support ASCII parentheses () and fullwidth （）.
  const out = s
    .replace(/\s*[\(（][^\)）]*[\)）]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}

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
  const [liveQuestions, setLiveQuestions] = useState([]);
  const [typedQuestions, setTypedQuestions] = useState([]);
  const [typedProgress, setTypedProgress] = useState({ qIdx: 0, chIdx: 0 });
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  const suggestAbortRef = useRef(null);
  const suggestTimerRef = useRef(null);
  const suggestLastAtRef = useRef(0);
  const typeTimerRef = useRef(null);
  const typeRunIdRef = useRef(0);

  const heuristicQuestions = buildHeuristicQuestions(input);
  const llmQuestions = input.trim() ? liveQuestions : questions;
  const rawDisplayQuestions = llmQuestions.length ? llmQuestions : heuristicQuestions;

  const displayQuestions = rawDisplayQuestions.map(stripParentheticals).filter(Boolean);
  const displayQuestionsKey = displayQuestions.join('\n');

  const resetUi = useCallback(() => {
    setInput('');
    setState('collecting');
    setQuestions([]);
    setLiveQuestions([]);
    setTypedQuestions([]);
    setTypedProgress({ qIdx: 0, chIdx: 0 });
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
      const token = await getIdToken({ forceRefresh: true });
      const out = await postJson('/api/report-build/turn', { text }, { token });
      setInput('');
      setState(out?.state ?? 'collecting');
      setQuestions(Array.isArray(out?.followupQuestions) ? out.followupQuestions : []);
      setLiveQuestions([]);
      setPreview(typeof out?.draftPreview === 'string' ? out.draftPreview : '');
    } catch (e) {
      setError(e?.message ?? 'Failed to send');
    } finally {
      setBusy(false);
    }
  }, [input, busy, getIdToken]);

  useEffect(() => {
    if (!open) return;
    if (busy) return;
    if (preview) return;
    if (state === 'confirming') return;

    const text = input.trim();
    if (!text || text.length < 20) {
      if (suggestTimerRef.current) {
        clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
        suggestAbortRef.current = null;
      }
      setSuggesting(false);
      setLiveQuestions([]);
      return;
    }

    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    const now = Date.now();
    const minIntervalMs = 2000;
    const sinceLast = now - (suggestLastAtRef.current || 0);
    const throttleDelay = sinceLast >= minIntervalMs ? 0 : (minIntervalMs - sinceLast);
    const delayMs = Math.max(300, throttleDelay);

    suggestTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      if (suggestAbortRef.current) suggestAbortRef.current.abort();
      suggestAbortRef.current = controller;

      setSuggesting(true);

      void (async () => {
        try {
          suggestLastAtRef.current = Date.now();
          const token = await getIdToken();
          const headers = new Headers({ 'Content-Type': 'application/json' });
          if (token) headers.set('Authorization', `Bearer ${token}`);

          const res = await fetch('/api/report-build/suggest', {
            method: 'POST',
            headers,
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

          const nextQs = Array.isArray(data?.followupQuestions) ? data.followupQuestions : [];
          const sufficient = Boolean(data?.sufficient);
          // On a successful response, replace questions to reflect what was answered.
          // If sufficient, clear the follow-ups.
          setLiveQuestions(sufficient ? [] : nextQs);
        } catch (e) {
          if (e?.name === 'AbortError') return;
          // Keep last questions on transient errors.
        } finally {
          setSuggesting(false);
        }
      })();
    }, delayMs);

    return () => {
      if (suggestTimerRef.current) {
        clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
        suggestAbortRef.current = null;
      }
    };
  }, [open, input, busy, preview, state, getIdToken]);

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

  // Typewriter effect for follow-up questions (fast).
  useEffect(() => {
    if (!open) return;
    if (preview) return;

    // Reset animation state on new questions.
    typeRunIdRef.current += 1;
    const runId = typeRunIdRef.current;

    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }

    setTypedQuestions(displayQuestions.map(() => ''));
    setTypedProgress({ qIdx: 0, chIdx: 0 });

    if (!displayQuestions.length) return;

    const step = () => {
      if (typeRunIdRef.current !== runId) return;

      setTypedProgress((prev) => {
        const qText = displayQuestions[prev.qIdx] ?? '';
        if (!qText) {
          const nextQ = prev.qIdx + 1;
          if (nextQ >= displayQuestions.length) return prev;
          return { qIdx: nextQ, chIdx: 0 };
        }

        if (prev.chIdx >= qText.length) {
          const nextQ = prev.qIdx + 1;
          if (nextQ >= displayQuestions.length) return prev;
          // Small pause between questions.
          typeTimerRef.current = setTimeout(step, 180);
          return { qIdx: nextQ, chIdx: 0 };
        }

        // Reveal next character.
        setTypedQuestions((prevQs) => {
          const next = [...prevQs];
          next[prev.qIdx] = qText.slice(0, prev.chIdx + 1);
          return next;
        });

        typeTimerRef.current = setTimeout(step, 25);
        return { qIdx: prev.qIdx, chIdx: prev.chIdx + 1 };
      });
    };

    typeTimerRef.current = setTimeout(step, 50);

    return () => {
      if (typeTimerRef.current) {
        clearTimeout(typeTimerRef.current);
        typeTimerRef.current = null;
      }
    };
  }, [open, preview, displayQuestionsKey]);

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

          {displayQuestions.length > 0 && !preview && (
            <div className={styles.questions} dir="rtl">
              <div className={styles.questionsTitle}>Follow-up questions</div>
              <ul className={styles.questionsList}>
                {typedQuestions.map((q, i) => (
                  <li key={`${i}-${displayQuestions[i] ?? ''}`} className={styles.questionItem}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

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

