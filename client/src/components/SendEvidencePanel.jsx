import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { ModalPanel } from '../ui/ModalPanel.jsx';

const STORAGE_KEY = 'communityResilienceEvidenceDraft';
const SAVE_DEBOUNCE_MS = 400;
const MAX_CHARS = 500_000;
const MAX_FILES = 20;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function readDraft() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(text) {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    /* ignore */
  }
}

function clearDraftCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
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

export function SendEvidencePanel({ open, onClose }) {
  const { getIdToken, apiReady } = useAuth();
  const { t } = useLanguage();
  const [value, setValue] = useState(readDraft);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [sending, setSending] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [ingestNote, setIngestNote] = useState('');
  const [analysisNote, setAnalysisNote] = useState('');
  const [lastServerSavedAt, setLastServerSavedAt] = useState('');
  const lastSyncedRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const submissionPollRef = useRef({ timerId: null });

  const fetchEvidence = useCallback(async () => {
    const headers = new Headers();
    const tok = await getIdToken();
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
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
      const tok = await getIdToken();
      if (tok) headers.set('Authorization', `Bearer ${tok}`);
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

  const cancelSubmissionPoll = useCallback(() => {
    if (submissionPollRef.current.timerId) {
      clearTimeout(submissionPollRef.current.timerId);
      submissionPollRef.current.timerId = null;
    }
  }, []);

  const fetchSubmissionStatus = useCallback(
    async (submissionId) => {
      const headers = new Headers();
      const tok = await getIdToken();
      if (tok) headers.set('Authorization', `Bearer ${tok}`);
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

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    setSyncError(null);
    (async () => {
      try {
        const data = await fetchEvidence();
        if (cancelled) return;
        const serverText = typeof data.content === 'string' ? data.content : '';
        const local = readDraft();
        if (serverText.trim().length > 0) {
          setValue(serverText);
          lastSyncedRef.current = serverText;
          setLastServerSavedAt(data?.updatedAt ?? '');
          clearDraftCache();
        } else if (local.trim().length > 0) {
          await putEvidence(local);
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
  }, [apiReady, fetchEvidence, putEvidence]);

  useEffect(() => {
    if (!hydrated) return;
    if (value !== lastSyncedRef.current) {
      writeDraft(value);
    }
  }, [value, hydrated]);

  useEffect(() => {
    if (!apiReady || !hydrated) return;
    if (value.length > MAX_CHARS) return;
    const id = setTimeout(() => {
      if (value === lastSyncedRef.current) return;
      void (async () => {
        if (saveInFlightRef.current) return;
        saveInFlightRef.current = true;
        try {
          setSyncError(null);
          const saved = await putEvidence(value);
          lastSyncedRef.current = value;
          setLastServerSavedAt(saved?.updatedAt ?? new Date().toISOString());
          clearDraftCache();
        } catch (e) {
          setSyncError(e?.message ?? 'Could not save draft');
          writeDraft(value);
        } finally {
          saveInFlightRef.current = false;
        }
      })();
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value, apiReady, hydrated, putEvidence]);

  const addFiles = useCallback((fileList) => {
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const f of fileList) {
        if (next.length >= MAX_FILES) break;
        if (f.size > MAX_FILE_BYTES) {
          setSyncError(`${f.name}: max ${MAX_FILE_BYTES / (1024 * 1024)}MB per file`);
          continue;
        }
        if (!next.some((x) => x.name === f.name && x.size === f.size)) {
          next.push(f);
        }
      }
      return next;
    });
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer?.files?.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleSend = useCallback(async () => {
    if (sending || !hydrated) return;
    const submittedContent = value;
    const filesSnapshot = [...pendingFiles];
    if (!submittedContent.trim() && filesSnapshot.length === 0) return;
    const hasUrl = /\bhttps?:\/\//i.test(submittedContent);
    setSending(true);
    setSyncError(null);
    setSavedOk(false);
    setIngestNote('');
    setAnalysisNote('');
    setValue('');
    lastSyncedRef.current = '';
    clearDraftCache();
    setPendingFiles([]);
    try {
      const tok = await getIdToken();
      const authHeaders = new Headers();
      if (tok) authHeaders.set('Authorization', `Bearer ${tok}`);

      if (filesSnapshot.length > 0) {
        const fd = new FormData();
        fd.append('content', submittedContent);
        for (const f of filesSnapshot) {
          fd.append('files', f, f.name);
        }
        const r = await fetch('/api/evidence-upload', { method: 'POST', headers: authHeaders, body: fd });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        const data = await r.json();
        lastSyncedRef.current = '';
        setLastServerSavedAt(data?.draft?.updatedAt ?? new Date().toISOString());
        if (data?.queued && Number.isFinite(Number(data?.submission?.id))) {
          const submissionId = Number(data.submission.id);
          setIngestNote(`Submission #${submissionId} queued for ingest.`);
          setAnalysisNote('8-component analysis queued…');
          cancelSubmissionPoll();
          void pollSubmissionUntilDone(submissionId);
        }
      } else {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (tok) headers.set('Authorization', `Bearer ${tok}`);
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
          lastSyncedRef.current = '';
          setLastServerSavedAt(data?.draft?.updatedAt ?? new Date().toISOString());
        }
        if (hasUrl && data?.queued && Number.isFinite(Number(data?.submission?.id))) {
          const submissionId = Number(data.submission.id);
          setIngestNote(`Submission #${submissionId} queued for ingest.`);
          setAnalysisNote('8-component analysis queued…');
          cancelSubmissionPoll();
          void pollSubmissionUntilDone(submissionId);
        }
      }
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setSyncError(e?.message ?? 'Could not send');
      setValue(submittedContent);
      setPendingFiles(filesSnapshot);
      lastSyncedRef.current = submittedContent;
      writeDraft(submittedContent);
    } finally {
      setSending(false);
    }
  }, [
    sending,
    hydrated,
    value,
    pendingFiles,
    getIdToken,
    cancelSubmissionPoll,
    pollSubmissionUntilDone,
  ]);

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={t('app.sendEvidence')}
      ariaLabel={t('app.sendEvidence')}
      initialWidth={920}
      initialHeight={680}
      zIndex={66}
    >
      <Stack spacing={1.4} sx={{ padding: '1rem 1.1rem 1.25rem' }}>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, maxWidth: '62ch' }}>
          {t('evidence.introExtended')}
        </Typography>
        {syncError && <Alert severity="error">{syncError}</Alert>}

        <TextField
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
          placeholder={t('evidence.placeholder')}
          multiline
          minRows={5}
          spellCheck
          inputProps={{ maxLength: MAX_CHARS, 'aria-label': t('app.sendEvidence') }}
          disabled={!hydrated}
          fullWidth
        />

        <Box
          component="label"
          htmlFor="send-evidence-file-input"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          sx={(theme) => ({
            border: dragActive
              ? `2px dashed ${theme.palette.primary.main}`
              : theme.custom.border.hairline,
            borderRadius: theme.custom.radius.lg,
            padding: theme.spacing(2),
            textAlign: 'center',
            background: dragActive ? theme.palette.action.selected : theme.palette.background.default,
            cursor: 'pointer',
            display: 'block',
          })}
        >
          <input
            id="send-evidence-file-input"
            type="file"
            multiple
            style={{ display: 'none' }}
            accept="audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.mp4,.webm,.mov,.mkv"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Stack alignItems="center" spacing={0.75}>
            <CloudUploadOutlinedIcon color="action" fontSize="large" />
            <Typography variant="body2" color="text.secondary">
              {t('evidence.dropHint')}
            </Typography>
          </Stack>
        </Box>

        {pendingFiles.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {pendingFiles.map((f) => (
              <Chip
                key={`${f.name}-${f.size}`}
                size="small"
                label={f.name}
                onDelete={() => setPendingFiles((prev) => prev.filter((x) => x !== f))}
              />
            ))}
            <Button size="small" onClick={() => setPendingFiles([])}>
              {t('evidence.clearFiles')}
            </Button>
          </Box>
        )}

        {!hydrated && (
          <Typography variant="caption" color="text.secondary">
            {t('evidence.loading')}
          </Typography>
        )}

        <Box
          sx={(theme) => ({
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: theme.spacing(1),
          })}
        >
          {savedOk && (
            <Typography variant="caption" sx={{ color: 'score.good.main', fontWeight: 500 }}>
              {t('evidence.savedOk')}
            </Typography>
          )}
          {lastServerSavedAt && (
            <Typography variant="caption" color="text.secondary">
              {t('evidence.savedAt').replace('{time}', formatSavedTime(lastServerSavedAt))}
            </Typography>
          )}
          {ingestNote && (
            <Typography variant="caption" sx={{ color: 'score.good.main', fontWeight: 500 }}>
              {ingestNote}
            </Typography>
          )}
          {analysisNote && (
            <Typography variant="caption" color="text.secondary">{analysisNote}</Typography>
          )}
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={!hydrated || sending || (!value.trim() && pendingFiles.length === 0)}
          >
            {sending ? t('evidence.saving') : t('evidence.send')}
          </Button>
        </Box>
      </Stack>
    </ModalPanel>
  );
}
