import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
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
import { PanelWindowShell } from '../ui/PanelWindowShell.jsx';
import { SidebarItem } from '../ui/SidebarItem.jsx';
import { OpenFullDocsStickyLink } from './OpenFullDocsStickyLink.jsx';
import { getDocsBaseUrl } from '../lib/docsUrl.js';

function canonicalFromMeta(meta) {
  const raw = meta?.canonical;
  return typeof raw === 'string' && raw.startsWith('http') ? raw : null;
}

const NAV_GROUP_ORDER = [
  'getting-started',
  'data-sources',
  'where-to-start',
  'trust',
  'guides',
  'operations',
  'troubleshooting',
];

const DATA_SOURCE_DOC_SLUGS = [
  'getting-started/data-sources',
  'getting-started/data-sources/news',
  'getting-started/data-sources/whatsapp',
  'getting-started/data-sources/audio-radio',
  'getting-started/data-sources/pbo-reports',
  'getting-started/data-sources/report-bot',
  'getting-started/data-sources/visits',
  'getting-started/data-sources/social-media',
  'getting-started/data-sources/pools',
  'getting-started/data-sources/google-trends',
  'getting-started/data-sources/send-data',
];

function buildDocsNavPriority() {
  const priority = new Map([
    ['index', -3],
    ['getting-started/get-started', -2],
    ['getting-started/using-the-app', -1],
    ['guides/operator-workflow', 20],
    ['guides/when-not-to-act', 21],
    ['guides/whatsapp-integration', 22],
    ['guides/news-ingestion', 23],
    ['guides/operating-daily-pipeline', 24],
    ['operations/common-failures', 25],
    ['trust/how-the-system-stays-trustworthy', 15],
    ['where-to-start/where-should-i-start', 12],
    ['troubleshooting/in-app-and-full-docs', 30],
  ]);
  DATA_SOURCE_DOC_SLUGS.forEach((slug, idx) => {
    priority.set(slug, idx);
  });
  return priority;
}

function isUserGuidePage(page) {
  const intent = String(page.intent ?? '');
  const slug = String(page.slug ?? '');
  const tags = Array.isArray(page.tags) ? page.tags.map(String) : [];
  const isUserIntent = intent === 'getting-started' || intent === 'where-to-start' || intent === 'trust' || intent === 'troubleshooting' || intent === 'guides' || intent === 'operations';
  const isDevOnly = tags.includes('local-dev') || slug.includes('install-and-run') || slug.includes('deploy');
  return isUserIntent && !isDevOnly;
}

function navGroupKey(page) {
  const slug = String(page.slug ?? '');
  if (DATA_SOURCE_DOC_SLUGS.includes(slug)) return 'data-sources';
  return String(page.intent ?? 'other');
}

function navSectionKey(groupKey) {
  const slug = String(groupKey ?? 'other').trim().toLowerCase();
  const map = {
    'getting-started': 'docsPanel.sectionGettingStarted',
    'data-sources': 'docsPanel.sectionDataSources',
    'where-to-start': 'docsPanel.sectionWhereToStart',
    trust: 'docsPanel.sectionTrust',
    troubleshooting: 'docsPanel.sectionTroubleshooting',
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

function sortPagesInNavGroup(groupKey, pages) {
  if (groupKey === 'data-sources') {
    const order = new Map(DATA_SOURCE_DOC_SLUGS.map((slug, idx) => [slug, idx]));
    return [...pages].sort(
      (a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99),
    );
  }
  const priority = buildDocsNavPriority();
  return [...pages].sort((a, b) => {
    const pa = priority.has(a.slug) ? priority.get(a.slug) : 100;
    const pb = priority.has(b.slug) ? priority.get(b.slug) : 100;
    if (pa !== pb) return pa - pb;
    return String(a.slug).localeCompare(String(b.slug));
  });
}

function groupPagesByNavGroup(pages) {
  const groups = new Map();
  for (const page of pages) {
    const key = navGroupKey(page);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(page);
  }
  for (const [key, list] of groups) {
    groups.set(key, sortPagesInNavGroup(key, list));
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ia = NAV_GROUP_ORDER.indexOf(a);
    const ib = NAV_GROUP_ORDER.indexOf(b);
    const pa = ia === -1 ? 100 : ia;
    const pb = ib === -1 ? 100 : ib;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

export function DocsPanel({ open, onClose, initialSlug, variant = 'modal' }) {
  const isActive = variant === 'window' || open;
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
    if (!isActive) return;
    void (async () => {
      await loadIndex();
    })();
  }, [isActive, loadIndex]);

  useEffect(() => {
    if (!isActive) return;
    void (async () => {
      await loadPage(selectedSlug);
    })();
  }, [isActive, selectedSlug, loadPage]);

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
      const priority = buildDocsNavPriority();
      return [...base].sort((a, b) => {
        const pa = priority.has(a.slug) ? priority.get(a.slug) : 100;
        const pb = priority.has(b.slug) ? priority.get(b.slug) : 100;
        if (pa !== pb) return pa - pb;
        return String(a.slug).localeCompare(String(b.slug));
      });
    }

    return base;
  }, [index, query]);

  const groupedPages = useMemo(() => groupPagesByNavGroup(filtered), [filtered]);

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

  const body = (
      <Box
        sx={(theme) => ({
          flex: 1,
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '300px 1fr' },
          gridTemplateRows: 'minmax(0, 1fr)',
          height: '100%',
          minHeight: 0,
          maxHeight: '100%',
          overflow: 'hidden',
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
            overflow: 'hidden',
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
            {groupedPages.map(([groupKey, pages]) => (
              <Box key={groupKey}>
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
                  {navSectionKey(groupKey) ? t(navSectionKey(groupKey)) : groupKey.replaceAll('-', ' ')}
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
          sx={{
            position: 'relative',
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <OpenFullDocsStickyLink
            href={fullDocsUrl}
            label={t('app.openFullDocs')}
            active={isActive}
            pin={variant === 'window' ? 'fixed' : 'overlay'}
          />
          <Box
            sx={(theme) => ({
              flex: 1,
              minHeight: 0,
              padding: theme.spacing(2),
              paddingTop: theme.spacing(5.5),
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
      </Box>
  );

  if (variant === 'window') {
    return (
      <PanelWindowShell
        title={t('app.docs')}
        ariaLabel={t('app.documentation')}
      >
        <Box sx={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {body}
        </Box>
      </PanelWindowShell>
    );
  }

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={t('app.docs')}
      ariaLabel={t('app.documentation')}
      initialWidth={1120}
      initialHeight={740}
      zIndex={60}
    >
      <Box sx={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {body}
      </Box>
    </ModalPanel>
  );
}

DocsPanel.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  initialSlug: PropTypes.string,
  variant: PropTypes.oneOf(['modal', 'window']),
};
