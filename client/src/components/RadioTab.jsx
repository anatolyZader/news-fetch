import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import PropTypes from 'prop-types';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useRadioDailyFeed, useRadioDashboard } from '../hooks/useRadio.js';
import { isRegionalReportScope } from '../lib/reportScopes.js';
import {
  EmptyState,
  ErrorState,
  KpiCard,
  KpiStrip,
  LoadingState,
  PageHeader,
  SectionHeading,
  dateToggleGridSx,
} from '../ui/index.js';
import { formatDate } from '../lib/date.js';
import { DistrictScopeSwitcher } from './DistrictScopeSwitcher.jsx';
import { IngestArticleCard } from './ingest/IngestArticleCard.jsx';
import { ResponsiveItemList } from './ingest/ResponsiveItemList.jsx';

export function RadioTab({
  userScope = 'national',
  onUserScopeChange,
  districtAccess = null,
}) {
  const { t, lang } = useLanguage();
  const { apiReady, getIdToken, getAppCheckToken } = useAuth();
  const { data: dashboard, loading: dashLoading, error: dashError } = useRadioDashboard({
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
  const activeDate = selectedDate || dates[0]?.date || '';

  const { data: feed, loading: feedLoading, error: feedError } = useRadioDailyFeed({
    date: activeDate,
    lang,
    getIdToken,
    getAppCheckToken,
    apiReady,
    userScope,
  });

  const districtScope = onUserScopeChange ? (
    <DistrictScopeSwitcher
      value={userScope}
      onChange={onUserScopeChange}
      districtAccess={districtAccess}
    />
  ) : null;

  if (dashLoading) {
    return (
      <Stack spacing={2.5}>
        <PageHeader title={t('tab.radio')} subtitle={t('radio.subtitle')} scope={districtScope} />
        <LoadingState>{t('radio.loading')}</LoadingState>
      </Stack>
    );
  }
  if (dashError) {
    return (
      <Stack spacing={2.5}>
        <PageHeader title={t('tab.radio')} subtitle={t('radio.subtitle')} scope={districtScope} />
        <ErrorState>{dashError}</ErrorState>
      </Stack>
    );
  }
  if (!dates.length) {
    return (
      <Stack spacing={2.5}>
        <PageHeader title={t('tab.radio')} subtitle={t('radio.subtitle')} scope={districtScope} />
        <EmptyState>{t('radio.noData')}</EmptyState>
      </Stack>
    );
  }

  const segments = feed?.segments ?? [];

  return (
    <Stack spacing={2.5}>
      <PageHeader title={t('tab.radio')} subtitle={t('radio.subtitle')} scope={districtScope} />

      {isRegionalReportScope(userScope) && (
        <Alert severity="info" variant="outlined">
          {t('radio.districtScopeHint', { scope: t(`district.${userScope}`) })}
        </Alert>
      )}

      {dashboard?.enabled === false && (
        <Alert severity="info">{t('radio.pipelineDisabled')}</Alert>
      )}

      <ToggleButtonGroup
        exclusive
        size="small"
        value={activeDate}
        onChange={(_, next) => { if (next) setSelectedDate(next); }}
        aria-label={t('radio.selectDate')}
        sx={(theme) => dateToggleGridSx(theme)}
      >
        {dates.map((d) => (
          <ToggleButton key={d.date} value={d.date}>
            {formatDate(d.date)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {feedLoading && <LoadingState>{t('radio.loadingFeed')}</LoadingState>}
      {feedError && <ErrorState>{feedError}</ErrorState>}

      {feed && !feedLoading && (
        <>
          <KpiStrip>
            <KpiCard label={t('radio.kpi.segments')} value={feed.segmentCount ?? 0} />
            <KpiCard label={t('radio.kpi.files')} value={feed.fileCount ?? 0} />
            <KpiCard label={t('radio.kpi.stations')} value={feed.stations?.length ?? 0} />
          </KpiStrip>

          <SectionHeading>{t('radio.segmentsHeading')}</SectionHeading>

          {segments.length === 0 ? (
            <EmptyState>{t('radio.emptyDay')}</EmptyState>
          ) : (
            <ResponsiveItemList
              items={segments}
              getItemKey={(segment) => segment.id}
              renderItem={(segment) => (
                <IngestArticleCard
                  title={segment.title}
                  body={segment.body}
                  titleOriginal={segment.titleOriginal}
                  bodyOriginal={segment.bodyOriginal}
                  source={segment.station || segment.source}
                  secondaryLabel={segment.program || undefined}
                  publishedAt={segment.publishedAt}
                  url={segment.url}
                  t={t}
                />
              )}
            />
          )}
        </>
      )}
    </Stack>
  );
}

RadioTab.propTypes = {
  userScope: PropTypes.string,
  onUserScopeChange: PropTypes.func,
  districtAccess: PropTypes.object,
};
