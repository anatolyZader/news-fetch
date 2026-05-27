import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useNewsSitesDailyFeed, useNewsSitesDashboard } from '../hooks/useNewsSites.js';
import {
  EmptyState,
  ErrorState,
  KpiCard,
  KpiStrip,
  LoadingState,
  PageHeader,
  SectionHeading,
} from '../ui/index.js';
import { formatDate } from '../lib/date.js';
import { IngestArticleCard } from './ingest/IngestArticleCard.jsx';

export function NewsTab() {
  const { t } = useLanguage();
  const { apiReady, getIdToken } = useAuth();
  const { data: dashboard, loading: dashLoading, error: dashError } = useNewsSitesDashboard({
    getIdToken,
    apiReady,
  });

  const dates = useMemo(
    () => [...(dashboard?.dates ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [dashboard?.dates],
  );

  const [selectedDate, setSelectedDate] = useState('');
  const activeDate = selectedDate || dates[0]?.date || '';

  const { data: feed, loading: feedLoading, error: feedError } = useNewsSitesDailyFeed({
    date: activeDate,
    getIdToken,
    apiReady,
  });

  if (dashLoading) return <LoadingState>{t('news.loading')}</LoadingState>;
  if (dashError) return <ErrorState>{dashError}</ErrorState>;
  if (!dates.length) return <EmptyState>{t('news.noData')}</EmptyState>;

  const articles = feed?.articles ?? [];

  return (
    <Stack spacing={2.5}>
      <PageHeader title={t('tab.news')} subtitle={t('news.subtitle')} />

      {dashboard?.enabled === false && (
        <Alert severity="info">{t('news.pipelineDisabled')}</Alert>
      )}

      <ToggleButtonGroup
        exclusive
        size="small"
        value={activeDate}
        onChange={(_, next) => { if (next) setSelectedDate(next); }}
        aria-label={t('news.selectDate')}
        sx={{ flexWrap: 'wrap' }}
      >
        {dates.map((d) => (
          <ToggleButton key={d.date} value={d.date}>
            {formatDate(d.date)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {feedLoading && <LoadingState>{t('news.loadingFeed')}</LoadingState>}
      {feedError && <ErrorState>{feedError}</ErrorState>}

      {feed && !feedLoading && (
        <>
          <KpiStrip>
            <KpiCard label={t('news.kpi.articles')} value={feed.articles?.length ?? 0} />
            <KpiCard label={t('news.kpi.sources')} value={feed.sourceCount ?? 0} />
            {feed.filteredFrom != null && feed.filteredTo != null && (
              <KpiCard
                label={t('news.kpi.filtered')}
                value={`${feed.filteredTo} / ${feed.filteredFrom}`}
              />
            )}
          </KpiStrip>

          <SectionHeading>{t('news.articlesHeading')}</SectionHeading>

          {articles.length === 0 ? (
            <EmptyState>{t('news.emptyDay')}</EmptyState>
          ) : (
            <Stack spacing={1.5}>
              {articles.map((article) => (
                <IngestArticleCard
                  key={article.id}
                  title={article.title}
                  body={article.body}
                  source={article.source}
                  publishedAt={article.publishedAt}
                  url={article.url}
                  t={t}
                />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
