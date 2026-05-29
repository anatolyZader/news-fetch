import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Link from '@mui/material/Link';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { MarkdownDocView } from './MarkdownDocView.jsx';
import { ModalPanel } from '../ui/ModalPanel.jsx';
import { SidebarItem } from '../ui/SidebarItem.jsx';
import { getDocsBaseUrl } from '../lib/docsUrl.js';

function canonicalFromMeta(meta) {
  const raw = meta?.canonical;
  return typeof raw === 'string' && raw.startsWith('http') ? raw : null;
}

const INTENT_ORDER = [
  'getting-started',
  'guides',
  'operations',
];

function isUserGuidePage(page) {
  const intent = String(page.intent ?? '');
  const slug = String(page.slug ?? '');
  const tags = Array.isArray(page.tags) ? page.tags.map(String) : [];
  const isUserIntent = intent === 'getting-started' || intent === 'guides' || intent === 'operations';
  const isDevOnly = tags.includes('local-dev') || slug.includes('install-and-run') || slug.includes('deploy');
  return isUserIntent && !isDevOnly;
}

function intentSectionKey(intent) {
  const slug = String(intent ?? 'other').trim().toLowerCase();
  const map = {
    'getting-started': 'docsPanel.sectionGettingStarted',
    guides: 'docsPanel.sectionGuides',
    operations: 'docsPanel.sectionOperations',
    concepts: 'docsPanel.sectionConcepts',
    architecture: 'docsPanel.sectionArchitecture',
    playbooks: 'docsPanel.sectionPlaybooks',
    api: 'docsPanel.sectionApi',
  };
  return map[slug] ?? null;
}

function filterUserGuidePages(pages) {
  return pages.filter(isUserGuidePage);
}

function groupPagesByIntent(pages) {
  const groups = new Map();
  for (const page of pages) {
    const intent = String(page.intent ?? 'other');
    if (!groups.has(intent)) groups.set(intent, []);
    groups.get(intent).push(page);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ia = INTENT_ORDER.indexOf(a);
    const ib = INTENT_ORDER.indexOf(b);
    const pa = ia === -1 ? 100 : ia;
    const pb = ib === -1 ? 100 : ib;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

export function DocsPanel({ open, onClose, initialSlug }) {
  const { getIdToken, authRequired, user } = useAuth();
  const { t } = useLanguage();
  const [index, setIndex] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState(initialSlug ?? 'getting-started/using-the-app');
  const [syncedInitialSlug, setSyncedInitialSlug] = useState(initialSlug);
  if (open && initialSlug !== syncedInitialSlug) {
    setSyncedInitialSlug(initialSlug);
    setSelectedSlug(initialSlug);
  }
  const [query, setQuery] = useState('');
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
    void (async () => {
      await loadIndex();
    })();
  }, [open, loadIndex]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      await loadPage(selectedSlug);
    })();
  }, [open, selectedSlug, loadPage]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const userGuide = filterUserGuidePages(index);
    const base = q
      ? userGuide.filter((p) => {
          const hay = `${p.title ?? ''} ${p.slug ?? ''} ${p.description ?? ''}`.toLowerCase();
          return hay.includes(q);
        })
      : userGuide;

    if (!q) {
      const priority = new Map([
        ['getting-started/decision-support', -2],
        ['getting-started/get-started', -1],
        ['getting-started/using-the-app', 0],
        ['guides/operator-workflow', 1],
        ['guides/when-not-to-act', 2],
        ['guides/whatsapp-integration', 3],
        ['guides/news-ingestion', 4],
        ['guides/operating-daily-pipeline', 5],
        ['operations/common-failures', 6],
      ]);
      return [...base].sort((a, b) => {
        const pa = priority.has(a.slug) ? priority.get(a.slug) : 100;
        const pb = priority.has(b.slug) ? priority.get(b.slug) : 100;
        if (pa !== pb) return pa - pb;
        return String(a.slug).localeCompare(String(b.slug));
      });
    }

    return base;
  }, [index, query]);

  const groupedPages = useMemo(() => groupPagesByIntent(filtered), [filtered]);

  const selectedMeta = useMemo(() => {
    const fromPage = page?.meta ?? {};
    const fromIndex = index.find((p) => p.slug === selectedSlug) ?? {};
    return {
      title: fromPage.title ?? fromIndex.title ?? selectedSlug,
      description: fromPage.description ?? fromIndex.description ?? null,
      stability: fromPage.stability ?? fromIndex.stability ?? null,
    };
  }, [page?.meta, index, selectedSlug]);

  const fullDocsUrl = useMemo(() => {
    const docsBaseUrl = getDocsBaseUrl();
    const direct = canonicalFromMeta(page?.meta);
    if (direct?.startsWith(docsBaseUrl)) return direct;
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
      initialWidth={1120}
      initialHeight={740}
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
              borderRadius: `${theme.custom.radius.section}px`,
              backgroundColor: alpha(theme.custom.pastel.mist, 0.65),
              '&:hover': { color: 'text.primary', backgroundColor: alpha(theme.custom.pastel.periwinkleLight, 0.55) },
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
        sx={(theme) => ({
          flex: 1,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '300px 1fr' },
          minHeight: 0,
          background: `linear-gradient(180deg, ${alpha(theme.custom.pastel.mist, 0.55)} 0%, ${theme.palette.background.default} 42%)`,
        })}
      >
        <Stack
          component="aside"
          spacing={1.25}
          sx={(theme) => ({
            borderRight: { md: theme.custom.border.hairline },
            borderBottom: { xs: theme.custom.border.hairline, md: 'none' },
            padding: theme.spacing(1.5),
            minHeight: 0,
          })}
        >
          <Paper
            variant="outlined"
            sx={(theme) => ({
              padding: theme.spacing(1.25),
              borderColor: alpha(theme.custom.pastel.periwinkleLight, 0.85),
              background: alpha(theme.palette.background.paper, 0.92),
              boxShadow: theme.custom.elevation.subtle,
            })}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={(theme) => ({ marginBottom: theme.spacing(1) })}>
              <Box
                sx={(theme) => ({
                  width: 32,
                  height: 32,
                  borderRadius: `${theme.custom.radius.section}px`,
                  display: 'grid',
                  placeItems: 'center',
                  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.18)} 0%, ${alpha(theme.custom.pastel.sky, 0.45)} 100%)`,
                  color: theme.palette.primary.dark,
                })}
              >
                <MenuBookRoundedIcon fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="cardTitle" component="p" sx={{ margin: 0 }}>
                  {t('docsPanel.userGuide')}
                </Typography>
                {!query.trim() && (
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ margin: 0 }}>
                    {t('docsPanel.welcomeHint')}
                  </Typography>
                )}
              </Box>
            </Stack>

            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={loadingIndex ? t('sub.loading') : t('docsPanel.searchPlaceholder')}
              inputProps={{ 'aria-label': t('docsPanel.searchAria') }}
              size="small"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
          </Paper>

          <Paper
            variant="outlined"
            component="nav"
            aria-label={t('docsPanel.navAria')}
            sx={(theme) => ({
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              borderColor: alpha(theme.custom.pastel.periwinkleLight, 0.85),
              background: alpha(theme.palette.background.paper, 0.88),
              boxShadow: theme.custom.elevation.subtle,
            })}
          >
            {groupedPages.map(([intent, pages]) => (
              <Box key={intent}>
                <Typography
                  variant="eyebrow"
                  color="text.secondary"
                  sx={(theme) => ({
                    paddingTop: theme.spacing(1.25),
                    paddingBottom: theme.spacing(0.5),
                    paddingLeft: theme.spacing(1.5),
                    paddingRight: theme.spacing(1.5),
                  })}
                >
                  {intentSectionKey(intent) ? t(intentSectionKey(intent)) : intent.replaceAll('-', ' ')}
                </Typography>
                {pages.map((p, idx) => (
                  <SidebarItem
                    key={p.slug}
                    grouped
                    active={selectedSlug === p.slug}
                    isLast={idx === pages.length - 1}
                    onClick={() => setSelectedSlug(p.slug)}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.75} sx={{ width: '100%' }}>
                      <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.title ?? p.slug}
                      </Box>
                      {p.locked && (
                        <Chip label={t('docsPanel.locked')} size="small" variant="outlined" sx={{ flexShrink: 0 }} />
                      )}
                    </Stack>
                  </SidebarItem>
                ))}
              </Box>
            ))}
            {filtered.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={(theme) => ({ padding: theme.spacing(2) })}>
                {t('docsPanel.noMatches')}
              </Typography>
            )}
          </Paper>
        </Stack>

        <Box
          component="section"
          aria-label={t('docsPanel.contentAria')}
          sx={(theme) => ({
            padding: theme.spacing(2),
            overflow: 'auto',
            minHeight: 0,
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
            <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 240 }} spacing={1.5}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                {t('sub.loading')}
              </Typography>
            </Stack>
          )}
          {!error && !loadingPage && (
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5} useFlexGap flexWrap="wrap">
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="h1"
                      component="h1"
                      sx={(theme) => ({
                        margin: 0,
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.25,
                      })}
                    >
                      {selectedMeta.title}
                    </Typography>
                    {selectedMeta.description && (
                      <Typography
                        variant="body1"
                        color="text.secondary"
                        component="p"
                        sx={(theme) => ({ marginTop: theme.spacing(0.75), marginBottom: 0, maxWidth: '52ch' })}
                      >
                        {selectedMeta.description}
                      </Typography>
                    )}
                  </Box>
                  {selectedMeta.stability && (
                    <Chip
                      size="small"
                      label={t('docsPanel.stability').replace('{stability}', String(selectedMeta.stability))}
                      sx={(theme) => ({
                        backgroundColor: alpha(theme.custom.pastel.mint, 0.35),
                        borderColor: alpha(theme.custom.pastel.mintDeep, 0.35),
                        fontWeight: 600,
                      })}
                      variant="outlined"
                    />
                  )}
                </Stack>
              </Box>

              <Paper
                variant="outlined"
                sx={(theme) => ({
                  paddingTop: theme.spacing(2.5),
                  paddingBottom: theme.spacing(3),
                  paddingLeft: theme.spacing(3),
                  paddingRight: theme.spacing(3),
                  borderColor: alpha(theme.custom.pastel.periwinkleLight, 0.9),
                  backgroundImage: `linear-gradient(165deg, ${alpha(theme.custom.pastel.mist, 0.55)} 0%, ${theme.palette.background.paper} 52%)`,
                  boxShadow: theme.custom.elevation.subtle,
                  textAlign: 'left',
                  width: '100%',
                })}
              >
                <MarkdownDocView markdown={page?.markdown ?? ''} banner={null} />
              </Paper>
            </Stack>
          )}
        </Box>
      </Box>
    </ModalPanel>
  );
}

DocsPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  initialSlug: PropTypes.string,
};
