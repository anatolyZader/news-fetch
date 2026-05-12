import { useCallback, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../ui/index.js';
import { formatDate } from '../lib/date.js';
import { useReportBotManualReports } from '../hooks/useReportBotManualReports.js';

function formatBytes(n) {
  const v = typeof n === 'number' ? n : 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  return `${Math.round(v / (1024 * 1024) * 10) / 10} MB`;
}

export function ReportBotManualReportsTab() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { apiReady, getIdToken } = useAuth();
  const { data, loading, error } = useReportBotManualReports({
    getIdToken,
    apiReady,
  });
  const [expanded, setExpanded] = useState(null);
  const [fullByName, setFullByName] = useState(() => /** @type {Record<string, string>} */ ({}));
  const [fullLoading, setFullLoading] = useState(null);
  const fetchedRef = useRef(new Set());

  const files = data?.files ?? [];
  const title = t('tab.reportBot');
  const subtitle = t('reportBotManual.subtitle');

  const sorted = useMemo(
    () => [...files].sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0)),
    [files],
  );

  const loadFull = useCallback(
    async (fileName) => {
      if (fetchedRef.current.has(fileName)) return;
      setFullLoading(fileName);
      try {
        const headers = new Headers();
        const token = await getIdToken();
        if (token) headers.set('Authorization', `Bearer ${token}`);
        const q = new URLSearchParams({ name: fileName });
        const res = await fetch(`/api/report-bot/manual-reports/file?${q.toString()}`, { headers });
        const text = await res.text();
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const j = JSON.parse(text);
            if (typeof j?.error === 'string' && j.error.trim()) detail = j.error.trim();
          } catch {
            /* plain text or HTML */
          }
          throw new Error(detail);
        }
        const json = JSON.parse(text);
        const content = String(json.content ?? '');
        setFullByName((prev) => ({ ...prev, [fileName]: content }));
        fetchedRef.current.add(fileName);
      } catch {
        setFullByName((prev) => ({
          ...prev,
          [fileName]: String(t('reportBotManual.loadFailed')),
        }));
      } finally {
        setFullLoading(null);
      }
    },
    [getIdToken, t],
  );

  const onAccordionChange =
    (fileName) =>
    async (_e, isExpanded) => {
      setExpanded(isExpanded ? fileName : null);
      if (isExpanded) await loadFull(fileName);
    };

  if (!apiReady || loading) {
    return (
      <Box sx={{ paddingTop: 2, paddingX: 2 }}>
        <PageHeader title={title} subtitle={subtitle} />
        <Box sx={{ marginTop: 2 }}>
          <LoadingState>{t('reportBotManual.loading')}</LoadingState>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ paddingTop: 2, paddingX: 2 }}>
        <PageHeader title={title} subtitle={subtitle} />
        <Box sx={{ marginTop: 2 }}>
          <ErrorState>{error}</ErrorState>
        </Box>
      </Box>
    );
  }

  if (!sorted.length) {
    return (
      <Box sx={{ paddingTop: 2, paddingX: 2 }}>
        <PageHeader title={title} subtitle={subtitle} />
        <Box sx={{ marginTop: 2 }}>
          <EmptyState>{t('reportBotManual.empty')}</EmptyState>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {t('reportBotManual.inboxHint').replace('{path}', data?.inboxRelative ?? 'report_bot')}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ paddingTop: 2, paddingX: 2, paddingBottom: 3 }}>
      <PageHeader title={title} subtitle={subtitle} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
        {t('reportBotManual.inboxHint').replace('{path}', data?.inboxRelative ?? 'report_bot')}
      </Typography>

      <Stack component="nav" spacing={1.25} sx={{ mt: 1 }} aria-label={t('reportBotManual.listAria')}>
        {sorted.map((row) => (
          <Paper
            key={row.fileName}
            elevation={0}
            sx={(th) => ({
              border: th.custom.border.hairline,
              borderRadius: th.custom.radius.lg,
              overflow: 'hidden',
              background:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.background.paper, 0.6)
                  : theme.palette.background.paper,
            })}
          >
            <Accordion
              elevation={0}
              disableGutters
              square
              expanded={expanded === row.fileName}
              onChange={onAccordionChange(row.fileName)}
              sx={{ background: 'transparent' }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={(th) => ({
                  '& .MuiAccordionSummary-content': { flexWrap: 'wrap', gap: 1 },
                  paddingLeft: th.spacing(2),
                  paddingRight: th.spacing(2),
                })}
              >
                <Stack spacing={0.35} sx={{ flex: '1 1 auto', minWidth: 140 }}>
                  <Typography variant="cardTitle">{row.fileName}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('reportBotManual.updated')} {formatDate(new Date(row.mtimeMs ?? 0))}{' · '}
                    {formatBytes(row.size)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                    {String(row.snippet ?? '').trim() || '—'}
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ paddingTop: 0, paddingX: 2, paddingBottom: 2 }}>
                {fullLoading === row.fileName ? (
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <CircularProgress size={22} thickness={4} />
                    <Typography variant="body2" color="text.secondary">
                      {t('reportBotManual.loading')}
                    </Typography>
                  </Stack>
                ) : (
                  <Box
                    component="pre"
                    sx={(th) => ({
                      margin: 0,
                      overflow: 'auto',
                      maxHeight: 520,
                      fontSize: th.typography.caption.fontSize,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    })}
                    dir="auto"
                  >
                    {fullByName[row.fileName] ?? '—'}
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
