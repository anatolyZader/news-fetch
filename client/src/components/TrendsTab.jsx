import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Cell, Line } from 'recharts';
import {
  QueriesIntelPanel,
  TopicDeepDivePanel,
} from './trends/TrendsTabPanels.jsx';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { alpha, useTheme } from '@mui/material/styles';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useSearchTrendsDashboard } from '../hooks/useSearchTrendsDashboard.js';
import {
  ISRAEL_DISTRICT_FILTER_ORDER,
  normalizeIsraelDistrictId,
  districtDisplayName,
} from '../lib/israelDistricts.js';
import {
  BarChartFrame,
  ChartCard,
  ChartGrid,
  EmptyState,
  FilterPill,
  FilterPillGroup,
  HorizontalBarChartFrame,
  KpiCard,
  KpiStrip,
  LineChartFrame,
  LoadingState,
  PageHeader,
  SectionHeading,
} from '../ui/index.js';

const LS_TRENDS_DISTRICT = 'vibes-witch:trendsDistrict';
const LS_TRENDS_DAYS = 'vibes-witch:trendsDays';
const LS_TRENDS_GROUP = 'vibes-witch:trendsTopicGroup';

const TOPIC_GROUP_ORDER = ['all', 'emergency', 'services', 'psycho'];

const WINDOW_OPTIONS = [
  { days: 1, labelKey: 'trends.window.day' },
  { days: 3, labelKey: 'trends.window.threeDays' },
  { days: 7, labelKey: 'trends.window.week' },
];
const VALID_WINDOW_DAYS = WINDOW_OPTIONS.map((w) => w.days);

const LINE_COLORS = [
  'blue',
  'red',
  'amber',
  'green',
  'purple',
  'teal',
  'orange',
  'yellow',
];

function readStoredDistrict() {
  if (typeof localStorage === 'undefined') return 'national';
  try {
    const v = localStorage.getItem(LS_TRENDS_DISTRICT);
    const id = normalizeIsraelDistrictId(v);
    if (id && ISRAEL_DISTRICT_FILTER_ORDER.includes(id)) return id;
  } catch { /* */ }
  return 'national';
}

function readStoredDays() {
  if (typeof localStorage === 'undefined') return 7;
  try {
    const n = Number.parseInt(localStorage.getItem(LS_TRENDS_DAYS) ?? '', 10);
    if (VALID_WINDOW_DAYS.includes(n)) return n;
  } catch { /* */ }
  return 7;
}

function readStoredTopicGroup() {
  if (typeof localStorage === 'undefined') return 'all';
  try {
    const v = localStorage.getItem(LS_TRENDS_GROUP);
    if (v && TOPIC_GROUP_ORDER.includes(v)) return v;
  } catch { /* */ }
  return 'all';
}

const SHORT_DATE_LABEL_RE = /([A-Za-z]{3})\s+(\d{1,2})/;

function shortDateLabel(raw) {
  const s = String(raw ?? '');
  const m = SHORT_DATE_LABEL_RE.exec(s);
  if (m) return `${m[1]} ${m[2]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(5);
  return s.length > 12 ? s.slice(0, 12) : s;
}

function filterTopics(topics, groupId) {
  if (!topics?.length || groupId === 'all') return topics ?? [];
  return topics.filter((t) => t.group === groupId);
}

function trendsFetchWarning(data, t) {
  if (data.source === 'demo' && !data.fetchError) {
    return t('trends.demoMode');
  }
  if (!data.fetchError) return null;

  const msg = String(data.fetchError);
  if (data.source === 'stale') {
    const when = data.generatedAt
      ? new Date(data.generatedAt).toLocaleString()
      : '—';
    return t('trends.staleFallback').replace('{date}', when).replace('{msg}', msg);
  }
  if (/payment required|40200/i.test(msg)) {
    return t('trends.paymentRequiredHint');
  }
  if (msg.includes('Google returned HTML')) {
    return t('trends.blockedHint');
  }
  return t('trends.demoFallback').replace('{msg}', msg);
}

export function TrendsTab() {
  const { t } = useLanguage();
  const theme = useTheme();
  const chart = theme.palette.chart;
  const colorList = LINE_COLORS.map((k) => chart?.[k] ?? chart?.blue ?? '#8b9cf0');
  const filterRef = useRef(null);

  const [districtId, setDistrictId] = useState(readStoredDistrict);
  const [days, setDays] = useState(readStoredDays);
  const [topicGroup, setTopicGroup] = useState(readStoredTopicGroup);
  const pendingFilterScrollRef = useRef(false);
  const { data, loading, refreshing, error, reload } = useSearchTrendsDashboard({
    districtId,
    days,
    enabled: true,
  });
  const selectDistrict = useCallback((id) => {
    if (!ISRAEL_DISTRICT_FILTER_ORDER.includes(id)) return;
    setDistrictId(id);
    try {
      localStorage.setItem(LS_TRENDS_DISTRICT, id);
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (!pendingFilterScrollRef.current) return;
    pendingFilterScrollRef.current = false;
    filterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [districtId]);

  const onDays = (_e, next) => {
    if (next == null) return;
    setDays(next);
    try {
      localStorage.setItem(LS_TRENDS_DAYS, String(next));
    } catch { /* */ }
  };

  const onTopicGroup = (id) => {
    setTopicGroup(id);
    try {
      localStorage.setItem(LS_TRENDS_GROUP, id);
    } catch { /* */ }
  };

  const filteredTopics = useMemo(
    () => filterTopics(data?.topics, topicGroup),
    [data?.topics, topicGroup],
  );

  const lineChartData = useMemo(() => {
    if (!data?.timeSeries?.length || !filteredTopics.length) return [];
    return data.timeSeries.map((row) => {
      const out = { date: shortDateLabel(row.date) };
      for (const topic of filteredTopics) {
        out[topic.id] = row[topic.id] ?? 0;
      }
      return out;
    });
  }, [data, filteredTopics]);

  const topicBarData = useMemo(() => {
    if (!filteredTopics.length) return [];
    return [...filteredTopics]
      .sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0))
      .map((topic) => ({
        name: t(topic.labelKey),
        value: topic.latest ?? 0,
        changePct: topic.changePct,
      }));
  }, [filteredTopics, t]);

  const regionBarData = useMemo(() => {
    if (!data?.regionBreakdown?.length) return [];
    return data.regionBreakdown.map((r) => ({
      name: districtDisplayName(t, r.labelKey ?? r.districtId),
      value: r.value,
      districtId: r.districtId,
    }));
  }, [data, t]);

  const analytics = data?.analytics;

  const filteredDeepDives = useMemo(() => {
    const dives = analytics?.topicDeepDives ?? [];
    if (topicGroup === 'all') return dives;
    const ids = new Set(
      (data?.topics ?? []).filter((tp) => tp.group === topicGroup).map((tp) => tp.id),
    );
    return dives.filter((d) => ids.has(d.topicId));
  }, [analytics?.topicDeepDives, topicGroup, data?.topics]);

  const groupLabel =
    topicGroup === 'all'
      ? t('trends.group.all')
      : t(`trends.group.${topicGroup}`);

  const filterSections = [
          {
            label: t('district.label'),
            accent: (theme) => theme.palette.primary.main,
            bg: (theme) =>
              `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.14)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
            pills: ISRAEL_DISTRICT_FILTER_ORDER.map((id) => (
              <FilterPill
                key={id}
                active={districtId === id}
                onClick={() => selectDistrict(id)}
              >
                {districtDisplayName(t, id)}
              </FilterPill>
            )),
          },
          {
            label: t('trends.windowLabel'),
            accent: (theme) => theme.palette.chart.teal,
            bg: (theme) =>
              `linear-gradient(90deg, ${alpha(theme.palette.chart.teal, 0.13)} 0%, ${alpha(theme.palette.chart.teal, 0.05)} 100%)`,
            pills: WINDOW_OPTIONS.map((w) => (
              <FilterPill
                key={w.days}
                active={days === w.days}
                onClick={() => onDays(null, w.days)}
              >
                {t(w.labelKey)}
              </FilterPill>
            )),
          },
          {
            label: t('trends.groupLabel'),
            accent: (theme) => theme.palette.chart.purple,
            bg: (theme) =>
              `linear-gradient(90deg, ${alpha(theme.palette.chart.purple, 0.13)} 0%, ${alpha(theme.palette.chart.purple, 0.05)} 100%)`,
            pills: TOPIC_GROUP_ORDER.map((id) => (
              <FilterPill
                key={id}
                active={topicGroup === id}
                onClick={() => onTopicGroup(id)}
              >
                {t(`trends.group.${id}`)}
              </FilterPill>
            )),
          },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 3 }}>
      <PageHeader
        title={t('trends.title')}
        subtitle={t('trends.subtitle')}
        action={(
          <Button variant="outlined" size="small" onClick={reload} disabled={loading}>
            {refreshing ? t('trends.loading') : t('trends.refresh')}
          </Button>
        )}
      />

      <Box
        ref={filterRef}
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'column',
          width: `calc(100% + ${theme.spacing(6)})`,
          maxWidth: 'none',
          mx: theme.spacing(-3),
          borderRadius: `${theme.custom.radius.section}px`,
          overflow: 'hidden',
          border: theme.custom.border.hairline,
          borderColor: alpha(theme.palette.primary.main, 0.22),
          boxShadow: theme.custom.elevation.subtle,
        })}
      >
        {filterSections.map((section, index) => (
          <Box
            key={section.label}
            sx={(theme) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              width: '100%',
              gap: theme.spacing(1.25),
              py: theme.spacing(2),
              px: theme.spacing(3),
              background: section.bg(theme),
              borderLeft: `3px solid ${alpha(section.accent(theme), 0.45)}`,
              ...(index > 0 && {
                borderTop: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
              }),
            })}
          >
            <Typography
              variant="eyebrow"
              sx={(theme) => ({
                width: '100%',
                textAlign: 'center',
                color: section.accent(theme),
              })}
            >
              {section.label}
            </Typography>
            <FilterPillGroup label={section.label} center>
              {section.pills}
            </FilterPillGroup>
          </Box>
        ))}
      </Box>

      {loading && !data && (
        <LoadingState>{t('trends.loading')}</LoadingState>
      )}

      {error && (
        <Alert severity="error" variant="outlined">
          {`${t('trends.error')}: ${error}`}
        </Alert>
      )}

      {!loading && !error && !data && (
        <EmptyState>{t('trends.empty')}</EmptyState>
      )}

      {data && (() => {
        const changePctLabel =
          days === 1
            ? 'trends.changePct.day'
            : days === 3
              ? 'trends.changePct.threeDays'
              : 'trends.changePct.week';

        const sourceLabel =
          data.source === 'live'
            ? t('trends.source.live')
            : data.source === 'cache'
              ? t('trends.source.cache')
              : data.source === 'stale'
                ? t('trends.source.stale')
                : t('trends.source.demo');

        const fetchWarning = trendsFetchWarning(data, t);

        const lineSeries = filteredTopics.map((topic, i) => (
          <Line
            key={topic.id}
            type="monotone"
            dataKey={topic.id}
            name={t(topic.labelKey)}
            stroke={colorList[i % colorList.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ));

        return (
          <>
      {fetchWarning && (
        <Alert severity={data.source === 'stale' ? 'info' : 'warning'} variant="outlined">
          {fetchWarning}
        </Alert>
      )}

      <Box
        sx={(theme) => ({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing(1.5),
          py: theme.spacing(0.5),
        })}
      >
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} alignItems="center">
          <Chip size="small" label={sourceLabel} variant="outlined" />
          <Chip size="small" label={groupLabel} variant="outlined" color="primary" />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {t('trends.generatedAt')}: {new Date(data.generatedAt).toLocaleString()}
        </Typography>
      </Box>

      <Divider sx={{ opacity: 0.6 }} />

      {filteredTopics.length === 0 ? (
        <EmptyState>{t('trends.emptyGroup')}</EmptyState>
      ) : (
        <>
          <KpiStrip columns={Math.min(4, filteredTopics.length) || 1}>
            {filteredTopics.slice(0, 4).map((topic) => (
              <KpiCard
                key={topic.id}
                label={t(topic.labelKey)}
                value={topic.latest ?? 0}
                helper={
                  topic.changePct == null
                    ? undefined
                    : t(changePctLabel).replace('{n}', String(topic.changePct))
                }
              />
            ))}
          </KpiStrip>

          <ChartGrid minColumnWidth={320}>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <ChartCard
                title={t('trends.chart.interestOverTime')}
                subtitle={groupLabel === t('trends.group.all') ? undefined : groupLabel}
              >
                {lineChartData.length === 0 ? (
                  <EmptyState>{t('trends.empty')}</EmptyState>
                ) : (
                  <LineChartFrame
                    data={lineChartData}
                    height={280}
                    yDomain={[0, 100]}
                    legend
                  >
                    {lineSeries}
                  </LineChartFrame>
                )}
              </ChartCard>
            </Box>

            <ChartCard title={t('trends.chart.topicRank')}>
              {topicBarData.length === 0 ? (
                <EmptyState>{t('trends.empty')}</EmptyState>
              ) : (
                <HorizontalBarChartFrame data={topicBarData} yKey="name" yWidth={140}>
                  <Bar dataKey="value" fill={chart.blue} radius={[0, 4, 4, 0]} />
                </HorizontalBarChartFrame>
              )}
            </ChartCard>

            {districtId === 'national' && regionBarData.length > 0 && (
              <Box sx={{ gridColumn: '1 / -1' }}>
                <ChartCard
                  title={t('trends.chart.byDistrict')}
                  subtitle={t('trends.chart.byDistrictHint')}
                >
                  <BarChartFrame data={regionBarData} xKey="name" height={220} legend={false}>
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer">
                      {regionBarData.map((entry, i) => (
                        <Cell
                          key={entry.districtId ?? i}
                          fill={colorList[i % colorList.length]}
                          opacity={0.9}
                          onClick={() => {
                            const id = entry.districtId;
                            if (!id) return;
                            pendingFilterScrollRef.current = true;
                            selectDistrict(id);
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Bar>
                  </BarChartFrame>
                </ChartCard>
              </Box>
            )}

          </ChartGrid>

          {analytics?.queriesIntel && (
            <QueriesIntelPanel queriesIntel={analytics.queriesIntel} t={t} />
          )}

          {filteredDeepDives.length > 0 && (
            <TopicDeepDivePanel
              dives={filteredDeepDives}
              t={t}
              chartColor={chart.blue}
              nationalColor={chart.gray}
            />
          )}
        </>
      )}
          </>
        );
      })()}

      <SectionHeading>{t('trends.aboutTitle')}</SectionHeading>
      <Typography variant="body2" color="text.secondary">
        {t('trends.disclaimer')}
      </Typography>
    </Box>
  );
}
