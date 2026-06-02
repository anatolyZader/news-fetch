import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { useAuth } from '../context/AuthContext.jsx';
import { buildAuthHeaders } from '../lib/authFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { ModalPanel } from '../ui/ModalPanel.jsx';
import { PanelWindowShell } from '../ui/PanelWindowShell.jsx';
import { panelHeaderButtonSx, panelInsetBoxSx, panelSectionRadius } from '../ui/panelChrome.js';
import PropTypes from 'prop-types';

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
  if (/ראיתי|שמעתי|נכנסו|לא נכנסו|התעלמו|אזעקה|ממ"ד|מקלט|מרחב מוגן/.test(t)) return true;
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
    .replaceAll(/\s*[(（][^)）]*[)）]\s*/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  return out;
}

async function postJson(url, body, { getIdToken, getAppCheckToken } = {}) {
  const headers = await buildAuthHeaders({ getIdToken, getAppCheckToken });
  headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.code = data?.code;
    throw err;
  }
  return data;
}

export function ReportBuildPanel({ open, onClose, variant = 'modal' }) {
  const {
    getIdToken,
    getAppCheckToken,
    apiReady,
    appCheckRequired,
    appCheckError,
    costlyRouteReady,
  } = useAuth();
  const { t } = useLanguage();
  const tRef = useRef(t);
  useLayoutEffect(() => {
    tRef.current = t;
  });

  const [input, setInput] = useState('');
  const [state, setState] = useState('collecting');
  const [questions, setQuestions] = useState([]);
  const [liveQuestions, setLiveQuestions] = useState([]);
  const [typedQuestions, setTypedQuestions] = useState([]);
  const [, setTypedProgress] = useState({ qIdx: 0, chIdx: 0 });
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setSuggesting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [localityOptions, setLocalityOptions] = useState([]);
  const [localityInput, setLocalityInput] = useState('');

  const suggestAbortRef = useRef(null);
  const suggestTimerRef = useRef(null);
  const suggestLastAtRef = useRef(0);
  const typeTimerRef = useRef(null);
  const typeRunIdRef = useRef(0);
  const sessionActiveRef = useRef(false);

  const heuristicQuestions = buildHeuristicQuestions(input);
  const llmQuestions = input.trim() ? liveQuestions : questions;
  const rawDisplayQuestions = llmQuestions.length ? llmQuestions : heuristicQuestions;

  const displayQuestions = rawDisplayQuestions.map(stripParentheticals).filter(Boolean);
  const displayQuestionsKey = displayQuestions.join('\n');
  const needsLocalityPicker = displayQuestions.some((q) => q.includes('בחר יישוב'));

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
      await postJson('/api/report-build/start', {}, { getIdToken, getAppCheckToken });
      setState('collecting');
      setQuestions([]);
      setPreview('');
      return true;
    } catch (e) {
      const code = e?.code;
      const msg = code === 'missing_app_check' || code === 'invalid_app_check'
        ? tRef.current('reportBuild.errorAppCheck')
        : (e?.message ?? tRef.current('reportBuild.errorStart'));
      setError(msg);
      return false;
    } finally {
      setBusy(false);
    }
  }, [getIdToken, getAppCheckToken]);

  const handlePanelClose = useCallback((event, reason) => {
    sessionActiveRef.current = false;
    onClose?.(event, reason);
  }, [onClose]);

  const cancel = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/report-build/cancel', {}, { getIdToken, getAppCheckToken });
      resetUi();
      sessionActiveRef.current = false;
      onClose?.();
    } catch (e) {
      setError(e?.message ?? tRef.current('reportBuild.errorCancel'));
    } finally {
      setBusy(false);
    }
  }, [getIdToken, getAppCheckToken, onClose, resetUi]);

  useEffect(() => {
    if (variant !== 'window') return undefined;
    const onPageHide = () => {
      if (!sessionActiveRef.current) return;
      void postJson('/api/report-build/cancel', {}, { getIdToken, getAppCheckToken }).catch(() => {});
    };
    globalThis.addEventListener('pagehide', onPageHide);
    return () => globalThis.removeEventListener('pagehide', onPageHide);
  }, [variant, getIdToken, getAppCheckToken]);

  const sendTurn = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      const out = await postJson('/api/report-build/turn', { text }, { getIdToken, getAppCheckToken });
      setInput('');
      setState(out?.state ?? 'collecting');
      setQuestions(Array.isArray(out?.followupQuestions) ? out.followupQuestions : []);
      setLiveQuestions([]);
      setPreview(typeof out?.draftPreview === 'string' ? out.draftPreview : '');
    } catch (e) {
      setError(e?.message ?? tRef.current('reportBuild.errorSend'));
    } finally {
      setBusy(false);
    }
  }, [input, busy, getIdToken, getAppCheckToken]);

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
      queueMicrotask(() => {
        setSuggesting(false);
        setLiveQuestions([]);
      });
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
          const headers = await buildAuthHeaders({ getIdToken, getAppCheckToken });
          headers.set('Content-Type', 'application/json');

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
  }, [open, input, busy, preview, state, getIdToken, getAppCheckToken]);

  useEffect(() => {
    if (!open || !needsLocalityPicker) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const headers = await buildAuthHeaders({ getIdToken, getAppCheckToken });
        const res = await fetch(
          `/api/geo/localities?q=${encodeURIComponent(localityInput.trim())}&scope=north`,
          { headers, signal: controller.signal },
        );
        const data = await res.json().catch(() => ({}));
        setLocalityOptions(Array.isArray(data?.localities) ? data.localities : []);
      } catch (e) {
        if (e?.name !== 'AbortError') setLocalityOptions([]);
      }
    })();
    return () => controller.abort();
  }, [open, needsLocalityPicker, localityInput, getIdToken, getAppCheckToken]);

  const confirmAndSubmit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      const confirmed = await postJson('/api/report-build/confirm', {}, { getIdToken, getAppCheckToken });
      const draftText = String(confirmed?.draftText ?? '').trim();
      if (!draftText) throw new Error(tRef.current('reportBuild.errorNoDraft'));

      await postJson('/api/evidence-submit', { content: draftText }, { getIdToken, getAppCheckToken });

      setSuccess(tRef.current('reportBuild.successSubmitted'));
      setQuestions([]);
      setPreview('');
      setState('collecting');
    } catch (e) {
      setError(e?.message ?? tRef.current('reportBuild.errorSubmit'));
    } finally {
      setBusy(false);
    }
  }, [busy, getIdToken, getAppCheckToken]);

  useEffect(() => {
    if (!open) {
      sessionActiveRef.current = false;
      return;
    }
    if (!apiReady || !costlyRouteReady) return;
    if (sessionActiveRef.current) return;
    sessionActiveRef.current = true;
    void (async () => {
      resetUi();
      const ok = await start();
      if (!ok) sessionActiveRef.current = false;
    })();
  }, [open, apiReady, costlyRouteReady, resetUi, start]);

  // Typewriter effect for follow-up questions (fast).
  useEffect(() => {
    if (!open) return;
    if (preview) return;

    const questions = displayQuestionsKey ? displayQuestionsKey.split('\n') : [];

    // Reset animation state on new questions.
    typeRunIdRef.current += 1;
    const runId = typeRunIdRef.current;

    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }

    queueMicrotask(() => {
      setTypedQuestions(questions.map(() => ''));
      setTypedProgress({ qIdx: 0, chIdx: 0 });
    });

    if (!questions.length) return;

    const step = () => {
      if (typeRunIdRef.current !== runId) return;

      setTypedProgress((prev) => {
        const qText = questions[prev.qIdx] ?? '';
        if (!qText) {
          const nextQ = prev.qIdx + 1;
          if (nextQ >= questions.length) return prev;
          return { qIdx: nextQ, chIdx: 0 };
        }

        if (prev.chIdx >= qText.length) {
          const nextQ = prev.qIdx + 1;
          if (nextQ >= questions.length) return prev;
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

  const headerRight = variant === 'window' ? (
    <Button
      variant="outlined"
      size="small"
      sx={panelHeaderButtonSx}
      onClick={() => void start()}
      disabled={busy}
    >
      {t('app.restart')}
    </Button>
  ) : (
    <>
      <Button
        variant="outlined"
        size="small"
        sx={panelHeaderButtonSx}
        onClick={() => void start()}
        disabled={busy}
      >
        {t('app.restart')}
      </Button>
      <Button
        variant="outlined"
        size="small"
        sx={panelHeaderButtonSx}
        onClick={cancel}
        disabled={busy}
      >
        {t('app.close')}
      </Button>
    </>
  );

  const body = (
    <Stack spacing={1.4} sx={{ padding: '1rem 1.1rem 1.25rem' }}>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
          {t('reportBuild.intro')}
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}
        {!error && appCheckError && (
          <Alert severity="error">{t('reportBuild.errorAppCheck')}</Alert>
        )}
        {!error && !appCheckError && appCheckRequired && !costlyRouteReady && (
          <Alert severity="info">{t('reportBuild.preparingSecurity')}</Alert>
        )}
        {success && <Alert severity="success">{success}</Alert>}

        {needsLocalityPicker && state === 'collecting' && (
          <Autocomplete
            options={localityOptions}
            getOptionLabel={(opt) => opt?.displayName ?? ''}
            inputValue={localityInput}
            onInputChange={(_, value) => setLocalityInput(value)}
            onChange={(_, value) => {
              if (!value) return;
              const idx = localityOptions.findIndex((o) => o.canonicalKey === value.canonicalKey);
              setInput(idx >= 0 ? String(idx + 1) : value.displayName);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('reportBuild.localityPicker') ?? 'Locality'}
                placeholder={t('reportBuild.localityPickerHint') ?? 'Search north localities'}
                disabled={busy}
              />
            )}
            disabled={busy}
            fullWidth
          />
        )}

        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={state === 'confirming' ? t('reportBuild.placeholderConfirming') : t('reportBuild.placeholderCollecting')}
          disabled={busy}
          multiline
          minRows={6}
          fullWidth
          sx={(theme) => ({
            '& .MuiOutlinedInput-root': { borderRadius: panelSectionRadius(theme) },
            '& .MuiOutlinedInput-notchedOutline': { borderRadius: panelSectionRadius(theme) },
          })}
        />

        {displayQuestions.length > 0 && !preview && (
          <Box
            dir="rtl"
            sx={(theme) => ({
              ...panelInsetBoxSx(theme),
              paddingTop: theme.spacing(1),
              paddingBottom: theme.spacing(1),
              paddingLeft: theme.spacing(1.25),
              paddingRight: theme.spacing(1.25),
              backgroundColor: theme.palette.background.paper,
            })}
          >
            <Typography
              variant="cardTitle"
              color="text.secondary"
              sx={(theme) => ({ marginBottom: theme.spacing(0.5) })}
            >
              {t('reportBuild.followupTitle')}
            </Typography>
            <Box
              component="ul"
              sx={(theme) => ({ margin: 0, paddingLeft: theme.spacing(2) })}
            >
              {typedQuestions.map((q, i) => (
                <Box
                  component="li"
                  key={`${i}-${displayQuestions[i] ?? ''}`}
                  sx={(theme) => ({
                    margin: `${theme.spacing(0.25)} 0`,
                    fontSize: theme.typography.body1.fontSize,
                    lineHeight: theme.typography.body1.lineHeight,
                  })}
                >
                  {q}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        <Stack direction="row" alignItems="center" spacing={1.2} useFlexGap flexWrap="wrap">
          <Button
            variant="contained"
            sx={panelHeaderButtonSx}
            onClick={sendTurn}
            disabled={busy || !input.trim()}
          >
            {state === 'confirming' ? t('reportBuild.updateDraft') : t('reportBuild.next')}
          </Button>
          {preview && (
            <Button variant="contained" sx={panelHeaderButtonSx} onClick={confirmAndSubmit} disabled={busy}>
              {t('reportBuild.confirmSubmit')}
            </Button>
          )}
        </Stack>

        {preview && (
          <>
            <Typography variant="cardTitle" color="text.secondary">
              {t('reportBuild.draftPreview')}
            </Typography>
            <Box
              sx={(theme) => ({
                ...panelInsetBoxSx(theme),
                paddingTop: theme.spacing(1.25),
                paddingBottom: theme.spacing(1.25),
                paddingLeft: theme.spacing(1.5),
                paddingRight: theme.spacing(1.5),
                whiteSpace: 'pre-wrap',
                fontSize: theme.typography.body1.fontSize,
                lineHeight: theme.typography.body1.lineHeight,
                backgroundColor: theme.palette.background.paper,
              })}
            >
              {preview}
            </Box>
          </>
        )}
      </Stack>
  );

  if (variant === 'window') {
    return (
      <PanelWindowShell
        title={t('app.writeReport')}
        ariaLabel={t('app.writeReport')}
        headerRight={headerRight}
      >
        {body}
      </PanelWindowShell>
    );
  }

  return (
    <ModalPanel
      open={open}
      onClose={handlePanelClose}
      title={t('app.writeReport')}
      ariaLabel={t('app.writeReport')}
      initialWidth={900}
      initialHeight={640}
      zIndex={65}
      modeless
      minimizeOnOutsideClick
      disableBackdropClose
      headerRight={headerRight}
    >
      {body}
    </ModalPanel>
  );
}

ReportBuildPanel.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  variant: PropTypes.oneOf(['modal', 'window']),
};
