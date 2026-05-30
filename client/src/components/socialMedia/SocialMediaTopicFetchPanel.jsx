import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import {
  fetchSocialMediaTopic,
  loadTopicFetchById,
} from '../../hooks/useSocialMedia.js';
import {
  DEFAULT_TOPIC_FETCH_PLATFORM_IDS,
  TOPIC_FETCH_PLATFORMS,
} from '../../constants/socialMediaPlatforms.js';
import {
  EmptyState,
  ErrorState,
  KpiCard,
  KpiStrip,
  LoadingState,
  SectionHeading,
} from '../../ui/index.js';
import { SocialMediaPostCard } from './SocialMediaPostCard.jsx';
import { SocialMediaPreviousSearchesMenu } from './SocialMediaPreviousSearchesMenu.jsx';

const LIVE_PLATFORMS = new Set(['x', 'telegram_public']);

const LS_PLATFORMS = 'vibes-witch:socialMediaPlatforms';
const LS_LAST_SEARCH = 'vibes-witch:socialMediaTopicLastSearch';

function shouldExecuteLiveFetch(platforms) {
  return platforms.some((p) => LIVE_PLATFORMS.has(p));
}

function readStoredPlatforms(defaults) {
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(LS_PLATFORMS);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* */ }
  return defaults;
}

function getInitialPlatforms() {
  const allowed = new Set(TOPIC_FETCH_PLATFORMS.map((p) => p.id));
  const stored = readStoredPlatforms(DEFAULT_TOPIC_FETCH_PLATFORM_IDS).filter((id) => allowed.has(id));
  return stored.length ? stored : DEFAULT_TOPIC_FETCH_PLATFORM_IDS;
}

function readLastSearchId() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_LAST_SEARCH);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

function storeLastSearchId(id) {
  if (typeof localStorage === 'undefined' || !id) return;
  try {
    localStorage.setItem(LS_LAST_SEARCH, JSON.stringify({ id }));
  } catch { /* */ }
}

export function SocialMediaTopicFetchPanel() {
  const { t, lang } = useLanguage();
  const { apiReady, getIdToken, getAppCheckToken } = useAuth();

  const [topic, setTopic] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState(getInitialPlatforms);
  const [result, setResult] = useState(null);
  const [activeSearchId, setActiveSearchId] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState(null);

  const executeLiveFetch = shouldExecuteLiveFetch(selectedPlatforms);

  const applyFetchedResult = useCallback((out) => {
    setResult(out);
    setError(null);
    if (out?.topic) setTopic(out.topic);
    if (Array.isArray(out?.platforms) && out.platforms.length) {
      setSelectedPlatforms(out.platforms);
      try { localStorage.setItem(LS_PLATFORMS, JSON.stringify(out.platforms)); } catch { /* */ }
    }
    const id = out?.id ?? null;
    setActiveSearchId(id);
    if (id) storeLastSearchId(id);
  }, []);

  useEffect(() => {
    if (!apiReady) return;
    const id = activeSearchId ?? readLastSearchId();
    if (!id) return;
    if (result?.id === id && result?.lang === lang) return;
    let cancelled = false;
    (async () => {
      setRestoring(true);
      try {
        const out = await loadTopicFetchById({ id, lang, getIdToken, getAppCheckToken });
        if (!cancelled) applyFetchedResult(out);
      } catch {
        if (!cancelled) {
          setResult(null);
          setActiveSearchId(null);
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [apiReady, getIdToken, lang, activeSearchId, result?.id, result?.lang, applyFetchedResult]);

  const togglePlatform = useCallback((id) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      try { localStorage.setItem(LS_PLATFORMS, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, []);

  const onLoadPreviousSearch = useCallback(async (search) => {
    if (!search?.id || restoring || fetching) return;
    setRestoring(true);
    setError(null);
    try {
      const out = await loadTopicFetchById({ id: search.id, lang, getIdToken, getAppCheckToken });
      applyFetchedResult(out);
    } catch (e) {
      setError(e?.message ?? t('socialMedia.topic.historyLoadFailed'));
    } finally {
      setRestoring(false);
    }
  }, [restoring, fetching, getIdToken, lang, applyFetchedResult, t]);

  const onFetch = useCallback(async () => {
    const q = topic.trim();
    if (!q || fetching) return;
    setFetching(true);
    setError(null);
    try {
      const out = await fetchSocialMediaTopic({
        topic: q,
        platforms: selectedPlatforms,
        execute: executeLiveFetch,
        lang,
        getIdToken,
        getAppCheckToken,
      });
      applyFetchedResult(out);
    } catch (e) {
      setError(e?.message ?? t('socialMedia.topic.fetchFailed'));
      setResult(null);
      setActiveSearchId(null);
    } finally {
      setFetching(false);
    }
  }, [topic, fetching, selectedPlatforms, executeLiveFetch, lang, getIdToken, t, applyFetchedResult]);

  const busy = fetching || restoring;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {t('socialMedia.topic.subtitle')}
        </Typography>
        <SocialMediaPreviousSearchesMenu
          activeId={activeSearchId}
          onSelect={(search) => { onLoadPreviousSearch(search).catch(() => {}); }}
          disabled={busy}
        />
      </Stack>

      <TextField
        label={t('socialMedia.topic.inputLabel')}
        placeholder={t('socialMedia.topic.inputPlaceholder')}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        multiline
        minRows={3}
        fullWidth
        dir="auto"
      />

      <Box>
        <SectionHeading>{t('socialMedia.topic.platforms')}</SectionHeading>
        <FormGroup row sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {TOPIC_FETCH_PLATFORMS.map((p) => (
            <FormControlLabel
              key={p.id}
              control={(
                <Checkbox
                  size="small"
                  checked={selectedPlatforms.includes(p.id)}
                  onChange={() => togglePlatform(p.id)}
                />
              )}
              label={t(p.labelKey)}
            />
          ))}
        </FormGroup>
      </Box>

      <Box>
        <Button
          variant="contained"
          onClick={() => { onFetch().catch(() => {}); }}
          disabled={busy || !topic.trim() || selectedPlatforms.length === 0}
        >
          {fetching ? t('socialMedia.topic.fetching') : t('socialMedia.topic.fetch')}
        </Button>
      </Box>

      {error && <ErrorState>{error}</ErrorState>}

      {busy && !result && <LoadingState>{restoring ? t('socialMedia.topic.restoring') : t('socialMedia.topic.fetching')}</LoadingState>}

      {result && !fetching && (
        <>
          <KpiStrip>
            <KpiCard label={t('socialMedia.kpi.matched')} value={result.stats?.matched ?? 0} />
            <KpiCard label={t('socialMedia.kpi.findings')} value={result.stats?.afterDedup ?? 0} />
            <KpiCard label={t('socialMedia.kpi.duplicatesFiltered')} value={result.stats?.duplicatesRemoved ?? 0} />
          </KpiStrip>

          {(result.posts ?? []).length === 0 ? (
            <EmptyState>
              {t('socialMedia.topic.noResults')}
              {result.mode === 'dry_run' && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {t('socialMedia.topic.dryRunHint')}
                </Typography>
              )}
              {(result.accessNotes ?? []).length > 0 && (
                <Box component="ul" sx={{ mt: 1.5, pl: 2, textAlign: 'start', maxWidth: 560, mx: 'auto' }}>
                  {result.accessNotes.map((note) => (
                    <Typography key={note} component="li" variant="body2" color="text.secondary">
                      {note}
                    </Typography>
                  ))}
                </Box>
              )}
            </EmptyState>
          ) : (
            <Stack spacing={1.5}>
              {(result.posts ?? []).map((post) => (
                <SocialMediaPostCard key={post.id} post={post} t={t} />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
