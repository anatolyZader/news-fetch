import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Link from '@mui/material/Link';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { MarkdownDocView } from './MarkdownDocView.jsx';
import { ModalPanel } from '../ui/ModalPanel.jsx';

function canonicalFromMeta(meta) {
  const raw = meta?.canonical;
  return typeof raw === 'string' && raw.startsWith('http') ? raw : null;
}

function getDocsBaseUrl() {
  const raw = import.meta?.env?.VITE_DOCS_BASE_URL;
  if (typeof raw !== 'string') return 'https://docs.vibeswitch.ai';
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed || 'https://docs.vibeswitch.ai';
}

export function DocsPanel({ open, onClose }) {
  const { getIdToken, authRequired, user } = useAuth();
  const { t } = useLanguage();
  const [index, setIndex] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('getting-started/using-the-app');
  const [query, setQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(null);

  const fetchJson = useCallback(
    async (url, { token } = {}) => {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      const contentType = res.headers.get('content-type') ?? '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await res.json() : null;
      if (!res.ok) {
        const message =
          data?.error || t('docsPanel.requestFailed').replace('{status}', String(res.status));
        const err = new Error(message);
        err.status = res.status;
        err.code = data?.code;
        throw err;
      }
      return data;
    },
    [t],
  );

  const loadIndex = useCallback(async () => {
    setLoadingIndex(true);
    setError(null);
    try {
      const token = await getIdToken();
      const data = await fetchJson('/api/docs/index', { token });
      setIndex(Array.isArray(data.pages) ? data.pages : []);
    } catch (err) {
      setError(err?.message ?? t('docsPanel.errorIndex'));
    } finally {
      setLoadingIndex(false);
    }
  }, [getIdToken, fetchJson, t]);

  const loadPage = useCallback(
    async (slug) => {
      if (!slug) return;
      setLoadingPage(true);
      setError(null);
      try {
        const token = await getIdToken();
        const data = await fetchJson(`/api/docs/page/${encodeURIComponent(slug)}`, { token });
        setPage(data);
      } catch (err) {
        setPage(null);
        if (err?.status === 401 && authRequired && !user) {
          setError(t('docsPanel.errorLocked'));
        } else {
          setError(err?.message ?? t('docsPanel.errorPage'));
        }
      } finally {
        setLoadingPage(false);
      }
    },
    [getIdToken, authRequired, user, t, fetchJson],
  );

  useEffect(() => {
    if (!open) return;
    void loadIndex();
  }, [open, loadIndex]);

  useEffect(() => {
    if (!open) return;
    void loadPage(selectedSlug);
  }, [open, selectedSlug, loadPage]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? index.filter((p) => {
          const hay = `${p.title ?? ''} ${p.slug ?? ''} ${p.description ?? ''}`.toLowerCase();
          return hay.includes(q);
        })
      : index;

    const inUserMode = !showAdvanced && !q;
    const visible = inUserMode
      ? base.filter((p) => {
          const intent = String(p.intent ?? '');
          const slug = String(p.slug ?? '');
          const tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
          const isUserIntent = intent === 'getting-started' || intent === 'guides' || intent === 'operations';
          const isDevOnly = tags.includes('local-dev') || slug.includes('install-and-run') || slug.includes('deploy');
          return isUserIntent && !isDevOnly;
        })
      : base;

    if (!q) {
      const priority = new Map([
        ['getting-started/using-the-app', 0],
        ['guides/whatsapp-integration', 1],
        ['guides/news-ingestion', 2],
        ['guides/operating-daily-pipeline', 3],
        ['operations/common-failures', 4],
      ]);
      return [...visible].sort((a, b) => {
        const pa = priority.has(a.slug) ? priority.get(a.slug) : 100;
        const pb = priority.has(b.slug) ? priority.get(b.slug) : 100;
        if (pa !== pb) return pa - pb;
        return String(a.slug).localeCompare(String(b.slug));
      });
    }

    return visible;
  }, [index, query, showAdvanced]);

  const fullDocsUrl = useMemo(() => {
    const docsBaseUrl = getDocsBaseUrl();
    const direct = canonicalFromMeta(page?.meta);
    if (direct && direct.startsWith(docsBaseUrl)) return direct;
    const idxCanonical = index.find((p) => p.slug === selectedSlug)?.canonical;
    if (typeof idxCanonical === 'string' && idxCanonical.startsWith(docsBaseUrl)) return idxCanonical;
    const slugPath = String(selectedSlug ?? '').replace(/^\/+/, '');
    return slugPath ? `${docsBaseUrl}/${slugPath}` : docsBaseUrl;
  }, [page?.meta, index, selectedSlug]);

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={t('app.docs')}
      ariaLabel={t('app.documentation')}
      initialWidth={1100}
      initialHeight={720}
      zIndex={60}
      headerRight={(
        <>
          <Link
            href={fullDocsUrl}
            target="_blank"
            rel="noreferrer"
            underline="none"
            sx={(theme) => ({
              fontSize: theme.typography.body2.fontSize,
              color: 'text.secondary',
              border: theme.custom.border.hairline,
              paddingTop: theme.spacing(0.5),
              paddingBottom: theme.spacing(0.5),
              paddingLeft: theme.spacing(0.75),
              paddingRight: theme.spacing(0.75),
              borderRadius: theme.custom.radius.md,
              '&:hover': { color: 'text.primary' },
            })}
          >
            {t('app.openFullDocs')}
          </Link>
          <Button variant="outlined" size="small" onClick={onClose}>
            {t('app.close')}
          </Button>
        </>
      )}
    >
      <Box
        sx={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '280px 1fr' },
          minHeight: 0,
        }}
      >
        <Stack
          component="aside"
          spacing={1}
          sx={(theme) => ({
            borderRight: { md: theme.custom.border.hairline },
            borderBottom: { xs: theme.custom.border.hairline, md: 'none' },
            padding: theme.spacing(1),
            minHeight: 0,
          })}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={loadingIndex ? t('sub.loading') : t('docsPanel.searchPlaceholder')}
              inputProps={{ 'aria-label': t('docsPanel.searchAria') }}
              size="small"
              fullWidth
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-pressed={showAdvanced}
              title={showAdvanced ? t('docsPanel.advHideTitle') : t('docsPanel.advShowTitle')}
              sx={(theme) => ({ borderRadius: theme.custom.radius.pill, flexShrink: 0 })}
            >
              {showAdvanced ? t('docsPanel.advOn') : t('docsPanel.advOff')}
            </Button>
          </Stack>

          <Stack
            component="nav"
            aria-label={t('docsPanel.navAria')}
            spacing={0.5}
            sx={(theme) => ({ overflow: 'auto', paddingRight: theme.spacing(0.25) })}
          >
            {!query.trim() && !showAdvanced && (
              <Typography
                variant="eyebrow"
                color="text.secondary"
                sx={(theme) => ({
                  marginTop: theme.spacing(0.5),
                  marginBottom: theme.spacing(0.25),
                  paddingLeft: theme.spacing(0.25),
                })}
              >
                {t('docsPanel.userGuide')}
              </Typography>
            )}
            {filtered.map((p) => (
              <Box
                key={p.slug}
                component="button"
                type="button"
                onClick={() => setSelectedSlug(p.slug)}
                sx={(theme) => ({
                  textAlign: 'left',
                  width: '100%',
                  border: `1px solid ${selectedSlug === p.slug ? theme.palette.primary.main : 'transparent'}`,
                  background: 'transparent',
                  color: selectedSlug === p.slug ? theme.palette.text.primary : theme.palette.text.secondary,
                  borderRadius: theme.custom.radius.lg,
                  paddingTop: theme.spacing(0.6),
                  paddingBottom: theme.spacing(0.6),
                  paddingLeft: theme.spacing(0.75),
                  paddingRight: theme.spacing(0.75),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing(0.75),
                  font: 'inherit',
                  '&:hover': { borderColor: theme.palette.divider, color: theme.palette.text.primary },
                })}
              >
                <span>{p.title ?? p.slug}</span>
                {p.locked && (
                  <Chip label={t('docsPanel.locked')} size="small" variant="outlined" />
                )}
              </Box>
            ))}
            {filtered.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('docsPanel.noMatches')}
              </Typography>
            )}
          </Stack>
        </Stack>

        <Box
          component="section"
          aria-label={t('docsPanel.contentAria')}
          sx={(theme) => ({
            paddingTop: theme.spacing(2),
            paddingBottom: theme.spacing(2.5),
            paddingLeft: theme.spacing(2),
            paddingRight: theme.spacing(2),
            overflow: 'auto',
          })}
        >
          {error && (
            <Alert
              severity="info"
              variant="outlined"
              sx={(theme) => ({
                color: 'text.secondary',
                border: `1px dashed ${theme.palette.divider}`,
                paddingTop: theme.spacing(1.25),
                paddingBottom: theme.spacing(1.25),
                paddingLeft: theme.spacing(1.5),
                paddingRight: theme.spacing(1.5),
              })}
            >
              {error}
            </Alert>
          )}
          {!error && loadingPage && (
            <Typography variant="body2" color="text.secondary">
              {t('sub.loading')}
            </Typography>
          )}
          {!error && !loadingPage && (
            <MarkdownDocView
              markdown={page?.markdown ?? ''}
              banner={
                page?.meta?.stability
                  ? t('docsPanel.stability').replace('{stability}', String(page.meta.stability))
                  : null
              }
            />
          )}
        </Box>
      </Box>
    </ModalPanel>
  );
}
