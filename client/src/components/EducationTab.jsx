import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, Cell, Line, Pie } from 'recharts';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import {
  BarChartFrame,
  ChartCard,
  ChartGrid,
  DetailPanel,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterPill,
  FilterPillGroup,
  FilterRow,
  GridTable,
  HorizontalBarChartFrame,
  KpiCard,
  KpiStrip,
  LineChartFrame,
  LoadingState,
  PageHeader,
  PieChartFrame,
  SectionHeading,
  SummaryStack,
} from '../ui/index.js';
import { formatDate } from '../lib/date.js';

const AGE_KEYS = ['toddlers', 'kindergarten', 'elementary', 'highschool'];

function buildPalettes(chart) {
  return {
    coping: {
      indifferent:         chart.gray,
      coping_easily:       chart.green,
      struggling_somewhat: chart.amber,
      struggling_greatly:  chart.red,
      other:               chart.grayLight,
    },
    freq: {
      high:    chart.red,
      low:     chart.amber,
      rarely:  chart.green,
      unknown: chart.grayLight,
    },
    intervention: {
      yes:     chart.red,
      no:      chart.green,
      maybe:   chart.amber,
      unknown: chart.grayLight,
    },
    bar: chart.blue,
  };
}

function countValues(arr) {
  const out = {};
  for (const v of arr) { if (v) out[v] = (out[v] || 0) + 1; }
  return out;
}

function distToChartData(dist, tLabel) {
  return Object.entries(dist)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => ({ name: tLabel(k), value: v }));
}

function aggregateSessions(sessions) {
  if (!sessions.length) return { trends: [], dist: {} };
  const sorted = [...sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const byDate = {};
  for (const s of sorted) {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  }
  const dates = Object.keys(byDate).sort();
  const trends = dates.map(date => {
    const rows = byDate[date];
    return {
      date,
      respondents: rows.length,
      copingDist:           countValues(rows.map(r => r.copingLevel)),
      streetMovementDist:   countValues(rows.map(r => r.streetMovement)),
      informalContactDist:  countValues(rows.map(r => r.informalContactFreq)),
      concerningTrendsDist: countValues(rows.flatMap(r => r.concerningTrends)),
      interventionDist:     countValues(rows.map(r => r.interventionNeeded)),
    };
  });
  const dist = {
    ageRanges:           countValues(sorted.flatMap(r => r.ageRanges)),
    activityType:        countValues(sorted.flatMap(r => r.activityType)),
    activityHours:       countValues(sorted.flatMap(r => r.activityHours)),
    streetMovement:      countValues(sorted.map(r => r.streetMovement)),
    informalContactFreq: countValues(sorted.map(r => r.informalContactFreq)),
    concerningTrends:    countValues(sorted.flatMap(r => r.concerningTrends)),
    exposureMethod:      countValues(sorted.flatMap(r => r.exposureMethod)),
    interventionNeeded:  countValues(sorted.map(r => r.interventionNeeded)),
    copingLevel:         countValues(sorted.map(r => r.copingLevel)),
  };
  return { trends, dist };
}

function CommentsTable({ comments, t, lang, showSettlement = true }) {
  if (!comments || comments.length === 0) {
    return <Typography variant="body2" color="text.secondary">{t('edu.comments.empty')}</Typography>;
  }
  const columns = [
    {
      key: 'date',
      label: t('edu.col.date'),
      render: (c) => (
        <Box sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {formatDate(c.date)}
        </Box>
      ),
    },
    showSettlement && {
      key: 'settlement',
      label: t('edu.col.settlement'),
      render: (c) => <Box sx={{ fontWeight: 500 }}>{c.settlement || '—'}</Box>,
    },
    {
      key: 'comment',
      label: t('edu.col.comment'),
      render: (c) => c.comment,
    },
  ].filter(Boolean);
  const gridTemplateColumns = showSettlement ? '80px 120px 1fr' : '80px 1fr';
  return (
    <GridTable columns={columns} rows={comments} gridTemplateColumns={gridTemplateColumns} />
  );
}

export function EducationTab() {
  const { getIdToken, apiReady } = useAuth();
  const { lang, t } = useLanguage();
  const theme = useTheme();
  const PALETTES = useMemo(() => buildPalettes(theme.palette.chart), [theme]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ageFilter, setAgeFilter] = useState(new Set());
  const [settlementFilter, setSettlementFilter] = useState(new Set());
  const [selectedSettlement, setSelectedSettlement] = useState(null);

  const tKey = useCallback((key) => {
    const MAP = {
      indifferent: t('coping.indifferent'),    coping_easily: t('coping.coping_easily'),
      struggling_somewhat: t('coping.struggling_somewhat'), struggling_greatly: t('coping.struggling_greatly'),
      other: t('coping.other'),
      high: t('freq.high'), low: t('freq.low'), rarely: t('freq.rarely'), unknown: t('freq.unknown'),
      toddlers: t('age.toddlers'), kindergarten: t('age.kindergarten'),
      nursery: t('age.kindergarten'),
      elementary: t('age.elementary'), highschool: t('age.highschool'),
      educational: t('activity.educational'), relief: t('activity.relief'),
      drugs: t('trend.drugs'), alcohol: t('trend.alcohol'),
      physical_violence: t('trend.physical_violence'), verbal_violence: t('trend.verbal_violence'),
      screens: t('trend.screens'), loneliness: t('trend.loneliness'), none_observed: t('trend.none_observed'),
      witnessed: t('exposure.witnessed'), child_shared: t('exposure.child_shared'),
      group_shared: t('exposure.group_shared'), adult_shared: t('exposure.adult_shared'),
      yes: t('intervention.yes'), no: t('intervention.no'), maybe: t('intervention.maybe'),
    };
    return MAP[key] ?? key;
  }, [t]);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const r = await fetch(forceRefresh ? '/api/education-sessions?refresh=1' : '/api/education-sessions', { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => { if (apiReady) load(); }, [apiReady, load]);

  const { trends, dist, filteredCount } = useMemo(() => {
    if (!data?.sessions) return { trends: [], dist: {}, filteredCount: 0 };
    let sessions = data.sessions;
    if (settlementFilter.size > 0) sessions = sessions.filter(s => settlementFilter.has(s.settlement));
    if (ageFilter.size > 0)        sessions = sessions.filter(s => s.ageRanges.some(a => ageFilter.has(a)));
    const { trends, dist } = aggregateSessions(sessions);
    return { trends, dist, filteredCount: sessions.length };
  }, [data, settlementFilter, ageFilter]);

  function toggleSet(setter, key) {
    setter(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function clearFilters() {
    setAgeFilter(new Set());
    setSettlementFilter(new Set());
  }
  const isFiltered = ageFilter.size > 0 || settlementFilter.size > 0;

  if (loading) return <LoadingState>{t('edu.loading')}</LoadingState>;
  if (error) return <ErrorState>{`${t('edu.error')}: ${error}`}</ErrorState>;
  if (!data?.summary) return <EmptyState>{t('edu.noData')}</EmptyState>;

  const { summary, recentComments, communityActivitiesComments = [], bySettlement = {} } = data;
  const settlementNames = Object.keys(bySettlement).sort();

  const kpis = [
    { label: t('edu.kpi.total'),       value: summary.totalResponses },
    { label: t('edu.kpi.latest'),      value: formatDate(summary.latestDate) },
    { label: t('edu.kpi.dateRange'),   value: `${formatDate(summary.dateRange.from)} – ${formatDate(summary.dateRange.to)}` },
  ];

  const copingTrend = trends.map(d => {
    const row = { date: formatDate(d.date) };
    for (const k of Object.keys(PALETTES.coping)) row[tKey(k)] = d.copingDist[k] ?? 0;
    return row;
  });

  const toChartData = (obj) => distToChartData(obj, tKey);

  function settlementCharts(s) {
    const copingTrend = s.trends.map(d => {
      const row = { date: formatDate(d.date) };
      for (const k of Object.keys(PALETTES.coping)) row[tKey(k)] = d.copingDist[k] ?? 0;
      return row;
    });
    const childrenTrend = s.trends.map(d => ({
      date: formatDate(d.date),
      [t('edu.axis.children')]: d.avgChildren,
    }));
    const freqTrend = (distKey) => s.trends.map(d => ({
      date: formatDate(d.date),
      [tKey('high')]:   d[distKey]?.high   ?? 0,
      [tKey('low')]:    d[distKey]?.low    ?? 0,
      [tKey('rarely')]: d[distKey]?.rarely ?? 0,
    }));
    return { copingTrend, childrenTrend, freqTrend };
  }

  const interventionData = toChartData(dist.interventionNeeded ?? {}).map(item => {
    const keyMap = {
      [tKey('yes')]: PALETTES.intervention.yes,
      [tKey('no')]: PALETTES.intervention.no,
      [tKey('maybe')]: PALETTES.intervention.maybe,
    };
    return { ...item, color: keyMap[item.name] || PALETTES.intervention.unknown };
  });

  const copingBars = Object.entries(PALETTES.coping).map(([k, color]) => (
    <Bar key={k} dataKey={tKey(k)} stackId="coping" fill={color} />
  ));

  const freqBars = (stackId) => (
    <>
      <Bar dataKey={tKey('high')}   stackId={stackId} fill={PALETTES.freq.high}   />
      <Bar dataKey={tKey('low')}    stackId={stackId} fill={PALETTES.freq.low}    />
      <Bar dataKey={tKey('rarely')} stackId={stackId} fill={PALETTES.freq.rarely} />
    </>
  );

  const FREQ_CHARTS = [
    { title: t('edu.chart.street'),  distKey: 'streetMovementDist',  stackId: 'street'  },
    { title: t('edu.chart.contact'), distKey: 'informalContactDist', stackId: 'contact' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pb: 2 }}>
      <PageHeader
        title={t('edu.title')}
        subtitle={t('edu.subtitle')}
        action={(
          <Button variant="outlined" size="small" onClick={() => load(true)}>
            {t('edu.refresh')}
          </Button>
        )}
      />

      <KpiStrip>
        {kpis.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} />)}
      </KpiStrip>

      <FilterBar
        footer={isFiltered ? {
          message: t('edu.filter.showing').replace('{n}', filteredCount).replace('{total}', summary.totalResponses),
          onClear: clearFilters,
          clearLabel: t('edu.filter.clear'),
        } : null}
      >
        <FilterRow label={t('edu.filter.age')}>
          <FilterPillGroup label={t('edu.filter.age')}>
            {AGE_KEYS.map((k) => (
              <FilterPill key={k} active={ageFilter.has(k)} onClick={() => toggleSet(setAgeFilter, k)}>
                {tKey(k)}
              </FilterPill>
            ))}
          </FilterPillGroup>
        </FilterRow>

        <FilterRow label={t('edu.filter.settlement')}>
          <FilterPillGroup label={t('edu.filter.settlement')}>
            {settlementNames.map((name) => (
              <FilterPill
                key={name}
                active={settlementFilter.has(name)}
                onClick={() => toggleSet(setSettlementFilter, name)}
              >
                {name}
              </FilterPill>
            ))}
          </FilterPillGroup>
        </FilterRow>
      </FilterBar>

      <SectionHeading>{t('edu.sec.trends')}</SectionHeading>
      <ChartCard title={t('edu.chart.coping')}>
        <BarChartFrame data={copingTrend} xKey="date" height={220} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
          {copingBars}
        </BarChartFrame>
      </ChartCard>

      <ChartGrid>
        {FREQ_CHARTS.map(({ title, distKey, stackId }) => {
          const trendData = trends.map(d => ({
            date: formatDate(d.date),
            [tKey('high')]:   d[distKey]?.high   ?? 0,
            [tKey('low')]:    d[distKey]?.low    ?? 0,
            [tKey('rarely')]: d[distKey]?.rarely ?? 0,
          }));
          return (
            <ChartCard key={title} title={title}>
              <BarChartFrame data={trendData} xKey="date">{freqBars(stackId)}</BarChartFrame>
            </ChartCard>
          );
        })}
      </ChartGrid>

      <SectionHeading>{t('edu.chart.trends')}</SectionHeading>
      <ChartGrid>
        <ChartCard title={t('edu.chart.trends')}>
          <HorizontalBarChartFrame data={toChartData(dist.concerningTrends ?? {})}>
            <Bar dataKey="value" fill={theme.palette.chart.orange} radius={[0, 4, 4, 0]} name={t('edu.axis.count')} barSize={20} />
          </HorizontalBarChartFrame>
        </ChartCard>
        <ChartCard title={t('edu.chart.exposure')}>
          <HorizontalBarChartFrame data={toChartData(dist.exposureMethod ?? {})}>
            <Bar dataKey="value" fill={theme.palette.chart.purple} radius={[0, 4, 4, 0]} name={t('edu.axis.count')} barSize={20} />
          </HorizontalBarChartFrame>
        </ChartCard>
      </ChartGrid>
      <ChartGrid>
        <ChartCard title={t('edu.chart.intervention')}>
          <PieChartFrame>
            <Pie data={interventionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}>
              {interventionData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChartFrame>
        </ChartCard>
      </ChartGrid>

      <Accordion>
        <AccordionSummary
          sx={(th) => ({
            paddingLeft: th.spacing(1.5),
            paddingRight: th.spacing(1.5),
            color: th.palette.text.secondary,
            ...th.typography.meta,
          })}
        >
          {t('edu.sec.secondary')}
        </AccordionSummary>
        <AccordionDetails
          sx={(th) => ({
            padding: 0,
            borderTop: th.custom.border.hairline,
          })}
        >
          {[
            { label: t('edu.chart.ageRanges'),    dist: dist.ageRanges },
            { label: t('edu.chart.activityType'), dist: dist.activityType },
            { label: t('edu.chart.activityHours'),dist: dist.activityHours },
          ].map(({ label, dist: d }) => {
            const total = Object.values(d ?? {}).reduce((s, v) => s + v, 0) || 1;
            const sorted = Object.entries(d ?? {}).sort(([, a], [, b]) => b - a);
            return (
              <Stack
                key={label}
                direction="row"
                alignItems="flex-start"
                useFlexGap
                flexWrap="wrap"
                spacing={1.5}
                sx={(th) => ({
                  paddingTop: th.spacing(0.75),
                  paddingBottom: th.spacing(0.75),
                  paddingLeft: th.spacing(1.5),
                  paddingRight: th.spacing(1.5),
                  borderBottom: th.custom.border.hairline,
                  '&:last-of-type': { borderBottom: 'none' },
                })}
              >
                <Typography
                  variant="meta"
                  color="text.secondary"
                  sx={(th) => ({ minWidth: 140, paddingTop: th.spacing(0.25) })}
                >
                  {label}
                </Typography>
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
                  {sorted.map(([k, v]) => (
                    <Chip
                      key={k}
                      size="small"
                      variant="outlined"
                      label={
                        <span>
                          {tKey(k)}{' '}
                          <Box
                            component="strong"
                            sx={(th) => ({
                              color: th.palette.primary.main,
                              marginInlineStart: th.spacing(0.5),
                            })}
                          >
                            {Math.round(v / total * 100)}%
                          </Box>
                        </span>
                      }
                    />
                  ))}
                </Stack>
              </Stack>
            );
          })}
        </AccordionDetails>
      </Accordion>

      <SectionHeading>{t('edu.sec.communityActivities')}</SectionHeading>
      <CommentsTable comments={communityActivitiesComments} t={t} lang={lang} />

      <SectionHeading>{t('edu.sec.comments')}</SectionHeading>
      <CommentsTable comments={recentComments} t={t} lang={lang} />

      {settlementNames.length > 0 && (
        <>
          <SectionHeading>{t('edu.sec.bySettlement')}</SectionHeading>
          <FilterPillGroup label={t('edu.sec.bySettlement')} spacing={0.7}>
            {settlementNames.map((name) => (
              <FilterPill
                key={name}
                active={selectedSettlement === name}
                onClick={() => setSelectedSettlement((s) => s === name ? null : name)}
              >
                {name}
              </FilterPill>
            ))}
          </FilterPillGroup>

          {selectedSettlement && bySettlement[selectedSettlement] && (() => {
            const s = bySettlement[selectedSettlement];
            const { copingTrend: sc, childrenTrend: ch, freqTrend } = settlementCharts(s);
            const summaryItems = [
              { label: t('edu.kpi.total'), value: s.totalResponses },
              {
                label: t('edu.kpi.dateRange'),
                value: s.sessionDates.length > 1
                  ? `${formatDate(s.sessionDates[0])} – ${formatDate(s.sessionDates[s.sessionDates.length - 1])}`
                  : formatDate(s.sessionDates[0]),
              },
              { label: t('edu.kpi.sessions'), value: s.sessionDates.length },
            ];
            return (
              <DetailPanel>
                <SummaryStack items={summaryItems} />
                <ChartGrid>
                  <ChartCard title={t('edu.chart.coping')}>
                    <BarChartFrame data={sc} xKey="date">{copingBars}</BarChartFrame>
                  </ChartCard>
                  {FREQ_CHARTS.map(({ title, distKey, stackId }) => (
                    <ChartCard key={title} title={title}>
                      <BarChartFrame data={freqTrend(distKey)} xKey="date">{freqBars(stackId)}</BarChartFrame>
                    </ChartCard>
                  ))}
                  <ChartCard title={t('edu.chart.children')}>
                    <LineChartFrame data={ch}>
                      <Line type="monotone" dataKey={t('edu.axis.children')} stroke={PALETTES.bar} strokeWidth={2} dot={{ r: 4 }} />
                    </LineChartFrame>
                  </ChartCard>
                </ChartGrid>

                {s.communityComments && s.communityComments.length > 0 && (
                  <>
                    <Typography variant="cardTitle" component="h4">{t('edu.sec.communityActivities')}</Typography>
                    <CommentsTable comments={s.communityComments} t={t} lang={lang} showSettlement={false} />
                  </>
                )}

                {s.comments.length > 0 && (
                  <>
                    <Typography variant="cardTitle" component="h4">{t('edu.sec.comments')}</Typography>
                    <CommentsTable comments={s.comments} t={t} lang={lang} showSettlement={false} />
                  </>
                )}
              </DetailPanel>
            );
          })()}
        </>
      )}
    </Box>
  );
}
