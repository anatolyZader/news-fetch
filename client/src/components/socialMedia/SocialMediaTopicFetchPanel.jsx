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
import { fetchSocialMediaTopic } from '../../hooks/useSocialMedia.js';
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

const LS_PLATFORMS = 'vibes-witch:socialMediaPlatforms';

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

export function SocialMediaTopicFetchPanel() {
  const { t, lang } = useLanguage();
  const { getIdToken } = useAuth();

  const [topic, setTopic] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [result, setResult] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);

  const onlyXSelected = selectedPlatforms.length === 1 && selectedPlatforms[0] === 'x';

  useEffect(() => {
    if (selectedPlatforms.length) return;
    const allowed = new Set(TOPIC_FETCH_PLATFORMS.map((p) => p.id));
    const stored = readStoredPlatforms(DEFAULT_TOPIC_FETCH_PLATFORM_IDS).filter((id) => allowed.has(id));
    setSelectedPlatforms(stored.length ? stored : DEFAULT_TOPIC_FETCH_PLATFORM_IDS);
  }, [selectedPlatforms.length]);

  const togglePlatform = useCallback((id) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      try { localStorage.setItem(LS_PLATFORMS, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, []);

  const onFetch = useCallback(async () => {
    const q = topic.trim();
    if (!q || fetching) return;
    setFetching(true);
    setError(null);
    try {
      const out = await fetchSocialMediaTopic({
        topic: q,
        platforms: selectedPlatforms,
        execute: onlyXSelected,
        lang,
        getIdToken,
      });
      setResult(out);
    } catch (e) {
      setError(e?.message ?? t('socialMedia.topic.fetchFailed'));
      setResult(null);
    } finally {
      setFetching(false);
    }
  }, [topic, fetching, selectedPlatforms, onlyXSelected, lang, getIdToken, t]);

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {t('socialMedia.topic.subtitle')}
      </Typography>

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
          onClick={() => void onFetch()}
          disabled={fetching || !topic.trim() || selectedPlatforms.length === 0}
        >
          {fetching ? t('socialMedia.topic.fetching') : t('socialMedia.topic.fetch')}
        </Button>
      </Box>

      {error && <ErrorState>{error}</ErrorState>}

      {fetching && <LoadingState>{t('socialMedia.topic.fetching')}</LoadingState>}

      {result && !fetching && (
        <>
          <KpiStrip>
            <KpiCard label={t('socialMedia.kpi.matched')} value={result.stats?.matched ?? 0} />
            <KpiCard label={t('socialMedia.kpi.findings')} value={result.stats?.afterDedup ?? 0} />
            <KpiCard label={t('socialMedia.kpi.duplicatesFiltered')} value={result.stats?.duplicatesRemoved ?? 0} />
          </KpiStrip>

          {(result.posts ?? []).length === 0 ? (
            <EmptyState>{t('socialMedia.topic.noResults')}</EmptyState>
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
