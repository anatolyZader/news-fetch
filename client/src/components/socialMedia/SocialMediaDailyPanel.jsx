import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useSocialMediaDailyFeed, useSocialMediaDashboard } from '../../hooks/useSocialMedia.js';
import {
  EmptyState,
  ErrorState,
  KpiCard,
  KpiStrip,
  LoadingState,
  SectionHeading,
  dateToggleGridSx,
} from '../../ui/index.js';
import { formatDate } from '../../lib/date.js';
import PropTypes from 'prop-types';
import { SocialMediaPostCard } from './SocialMediaPostCard.jsx';
import { ResponsiveItemList } from '../ingest/ResponsiveItemList.jsx';

export function SocialMediaDailyPanel({ userScope = 'national' }) {
  const { t, lang } = useLanguage();
  const { apiReady, getIdToken, getAppCheckToken } = useAuth();
  const { data: dashboard, loading: dashLoading, error: dashError } = useSocialMediaDashboard({
    getIdToken,
    getAppCheckToken,
    apiReady,
    userScope,
  });

  const dates = useMemo(
    () => [...(dashboard?.dates ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [dashboard?.dates],
  );

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const activeDate = selectedDate || dates[0]?.date || '';

  const { data: feed, loading: feedLoading, error: feedError } = useSocialMediaDailyFeed({
    date: activeDate,
    categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
    lang,
    getIdToken,
    getAppCheckToken,
    apiReady,
    userScope,
  });

  if (dashLoading) return <LoadingState>{t('socialMedia.loading')}</LoadingState>;
  if (dashError) return <ErrorState>{dashError}</ErrorState>;
  if (!dates.length) return <EmptyState>{t('socialMedia.daily.noData')}</EmptyState>;

  const categories = feed?.categories ?? [];
  const visiblePosts = selectedCategory === 'all'
    ? categories.flatMap((c) => c.posts ?? [])
    : (categories.find((c) => c.id === selectedCategory)?.posts ?? []);

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {t('socialMedia.daily.subtitle')}
      </Typography>

      <ToggleButtonGroup
        exclusive
        size="small"
        value={activeDate}
        onChange={(_, next) => { if (next) setSelectedDate(next); }}
        aria-label={t('socialMedia.selectDate')}
        sx={(theme) => dateToggleGridSx(theme)}
      >
        {dates.map((d) => (
          <ToggleButton key={d.date} value={d.date}>
            {formatDate(d.date)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {feedLoading && <LoadingState>{t('socialMedia.loadingReport')}</LoadingState>}
      {feedError && <ErrorState>{feedError}</ErrorState>}

      {feed && !feedLoading && (
        <>
          <KpiStrip>
            <KpiCard label={t('socialMedia.kpi.findings')} value={feed.stats?.afterDedup ?? 0} />
            <KpiCard label={t('socialMedia.kpi.duplicatesFiltered')} value={feed.stats?.duplicatesRemoved ?? 0} />
            <KpiCard label={t('socialMedia.kpi.categories')} value={categories.length} />
          </KpiStrip>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={selectedCategory}
            onChange={(_, next) => { if (next) setSelectedCategory(next); }}
            aria-label={t('socialMedia.daily.filterCategory')}
            sx={(theme) => dateToggleGridSx(theme, { minColumnWidth: 120 })}
          >
            <ToggleButton value="all">{t('socialMedia.daily.allCategories')}</ToggleButton>
            {categories.map((c) => (
              <ToggleButton key={c.id} value={c.id}>
                {t(c.labelKey)} ({c.count})
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {Array.isArray(feed.accessLimitations) && feed.accessLimitations.length > 0 && (
            <Alert severity="info" variant="outlined">
              {feed.accessLimitations[0]}
            </Alert>
          )}

          {selectedCategory === 'all' ? (
            categories.map((cat) => (
              <Box key={cat.id}>
                <SectionHeading>
                  {t(cat.labelKey)} ({cat.count})
                </SectionHeading>
                <ResponsiveItemList
                  items={cat.posts ?? []}
                  getItemKey={(post) => post.id}
                  estimateSize={220}
                  renderItem={(post) => (
                    <SocialMediaPostCard post={{ ...post, categoryId: cat.id }} t={t} />
                  )}
                />
              </Box>
            ))
          ) : (
            <ResponsiveItemList
              items={visiblePosts}
              getItemKey={(post) => post.id}
              estimateSize={220}
              renderItem={(post) => (
                <SocialMediaPostCard post={post} t={t} />
              )}
            />
          )}

          {visiblePosts.length === 0 && (
            <EmptyState>{t('socialMedia.daily.emptyCategory')}</EmptyState>
          )}
        </>
      )}
    </Stack>
  );
}

SocialMediaDailyPanel.propTypes = {
  userScope: PropTypes.string,
};
