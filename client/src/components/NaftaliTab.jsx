import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar } from 'recharts';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
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
  KpiCard,
  KpiStrip,
  LoadingState,
  PageHeader,
  SectionHeading,
  SummaryStack,
} from '../ui/index.js';
import { formatDate } from '../lib/date.js';

function buildSeverityColors(chart) {
  return {
    high:    chart.red,
    medium:  chart.amber,
    low:     chart.green,
    none:    chart.gray,
    unknown: chart.grayLight,
  };
}

function buildVulnColors(chart) {
  return [chart.red, chart.amber, chart.blue, chart.purple, chart.teal, chart.amberDark];
}

const VULN_KEYS = [
  'physicalDisability', 'mentalDisability', 'specialEducation',
  'domesticViolence', 'severeFinancial', 'singleParent',
];

const SEVERITY_KEYS = [
  'financialRequests', 'schoolMentalHealth', 'communityMentalHealth',
  'parentalStress', 'coupleConflicts', 'parentChildConflicts',
];

function formatWeekLabel(trend) {
  if (trend.week != null) return `W${trend.week}`;
  if (trend.dateFrom) return formatDate(trend.dateFrom);
  return '?';
}

export function NaftaliTab() {
  const { getIdToken, apiReady } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();
  const SEVERITY_COLORS = useMemo(() => buildSeverityColors(theme.palette.chart), [theme]);
  const VULN_COLORS = useMemo(() => buildVulnColors(theme.palette.chart), [theme]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMuni, setSelectedMuni] = useState(null);
  const [muniFilter, setMuniFilter] = useState(new Set());

  const tSev = useCallback((key) => {
    const MAP = {
      high: t('naf.sev.high'), medium: t('naf.sev.medium'),
      low: t('naf.sev.low'), none: t('naf.sev.none'), unknown: t('naf.sev.unknown'),
    };
    return MAP[key] ?? key;
  }, [t]);

  const tDim = useCallback((key) => {
    const MAP = {
      financialRequests: t('naf.dim.financial'),
      schoolMentalHealth: t('naf.dim.schoolMH'),
      communityMentalHealth: t('naf.dim.communityMH'),
      parentalStress: t('naf.dim.parentStress'),
      coupleConflicts: t('naf.dim.couples'),
      parentChildConflicts: t('naf.dim.parentChild'),
    };
    return MAP[key] ?? key;
  }, [t]);

  const tVuln = useCallback((key) => {
    const MAP = {
      physicalDisability: t('naf.vuln.physical'),
      mentalDisability: t('naf.vuln.mental'),
      specialEducation: t('naf.vuln.specialEd'),
      domesticViolence: t('naf.vuln.domestic'),
      severeFinancial: t('naf.vuln.financial'),
      singleParent: t('naf.vuln.singleParent'),
    };
    return MAP[key] ?? key;
  }, [t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const r = await fetch('/api/naftali', { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      await load();
    })();
  }, [apiReady, load]);

  const filteredTrends = useMemo(() => {
    if (!data?.weeks || muniFilter.size === 0) return data?.trends ?? [];
    return data.weeks.map(week => {
      const rs = week.responses.filter(r => muniFilter.has(r.municipality));
      const severityDist = {};
      for (const key of SEVERITY_KEYS) {
        severityDist[key] = { high: 0, medium: 0, low: 0, none: 0, unknown: 0, qualitative: 0 };
        for (const r of rs) {
          const val = r.severity[key];
          if (val in severityDist[key]) severityDist[key][val]++;
        }
      }
      const vulnTotals = {};
      for (const key of VULN_KEYS) {
        vulnTotals[key] = rs.reduce((s, r) => s + r.vulnerable[key], 0);
      }
      return {
        week: week.week,
        file: week.file,
        dateFrom: week.dateFrom,
        dateTo: week.dateTo,
        municipalityCount: rs.length,
        severityDist,
        vulnTotals,
      };
    });
  }, [data, muniFilter]);

  function toggleSet(setter, key) {
    setter(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (loading) return <LoadingState>{t('naf.loading')}</LoadingState>;
  if (error)   return <ErrorState>{`${t('naf.error')}: ${error}`}</ErrorState>;
  if (!data?.summary) return <EmptyState>{t('naf.noData')}</EmptyState>;

  const { summary, recentComments = [], byMunicipality = {} } = data;
  const muniNames = data.municipalities ?? [];

  const kpis = [
    { label: t('naf.kpi.totalResponses'), value: summary.totalResponses },
    { label: t('naf.kpi.weeks'),          value: summary.totalWeeks },
    { label: t('naf.kpi.municipalities'), value: muniNames.length },
    { label: t('naf.kpi.dateRange'),      value: summary.dateRange ? `${formatDate(summary.dateRange.from)} – ${formatDate(summary.dateRange.to)}` : '—' },
  ];

  const severityChartData = SEVERITY_KEYS.map(dimKey => ({
    dimKey,
    data: filteredTrends.map(tr => {
      const d = tr.severityDist?.[dimKey] ?? {};
      return {
        label: formatWeekLabel(tr),
        [tSev('high')]:    d.high    ?? 0,
        [tSev('medium')]:  d.medium  ?? 0,
        [tSev('low')]:     d.low     ?? 0,
        [tSev('none')]:    d.none    ?? 0,
      };
    }),
  }));

  const vulnChartData = filteredTrends.map(tr => {
    const row = { label: formatWeekLabel(tr) };
    for (const key of VULN_KEYS) row[tVuln(key)] = tr.vulnTotals?.[key] ?? 0;
    return row;
  });

  const severityBars = (
    <>
      <Bar dataKey={tSev('high')}   stackId="s" fill={SEVERITY_COLORS.high}   />
      <Bar dataKey={tSev('medium')} stackId="s" fill={SEVERITY_COLORS.medium} />
      <Bar dataKey={tSev('low')}    stackId="s" fill={SEVERITY_COLORS.low}    />
      <Bar dataKey={tSev('none')}   stackId="s" fill={SEVERITY_COLORS.none}   />
    </>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pb: 2 }}>
      <PageHeader
        title={t('naf.title')}
        subtitle={t('naf.subtitle')}
        action={(
          <Button variant="outlined" size="small" onClick={() => load()}>
            {t('naf.refresh')}
          </Button>
        )}
      />

      <KpiStrip>
        {kpis.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} />)}
      </KpiStrip>

      <FilterBar
        footer={muniFilter.size > 0 ? {
          message: t('naf.filter.showing').replace('{n}', muniFilter.size).replace('{total}', muniNames.length),
          onClear: () => setMuniFilter(new Set()),
          clearLabel: t('naf.filter.clear'),
        } : null}
      >
        <FilterRow label={t('naf.filter.municipality')}>
          <FilterPillGroup label={t('naf.filter.municipality')}>
            {muniNames.map((name) => (
              <FilterPill
                key={name}
                active={muniFilter.has(name)}
                onClick={() => toggleSet(setMuniFilter, name)}
              >
                {name}
              </FilterPill>
            ))}
          </FilterPillGroup>
        </FilterRow>
      </FilterBar>

      <SectionHeading>{t('naf.sec.severity')}</SectionHeading>
      <ChartGrid>
        {severityChartData.map(({ dimKey, data: chartData }) => (
          <ChartCard key={dimKey} title={tDim(dimKey)}>
            <BarChartFrame data={chartData}>{severityBars}</BarChartFrame>
          </ChartCard>
        ))}
      </ChartGrid>

      <SectionHeading>{t('naf.sec.vulnerable')}</SectionHeading>
      <ChartCard title={t('naf.chart.vulnOverTime')}>
        <BarChartFrame data={vulnChartData} height={260} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
          {VULN_KEYS.map((key, i) => (
            <Bar key={key} dataKey={tVuln(key)} fill={VULN_COLORS[i]} />
          ))}
        </BarChartFrame>
      </ChartCard>

      <SectionHeading>{t('naf.sec.comments')}</SectionHeading>
      {recentComments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('naf.comments.empty')}</Typography>
      ) : (
        <GridTable
          gridTemplateColumns="120px 1fr 1fr"
          columns={[
            {
              key: 'municipality',
              label: t('naf.col.municipality'),
              render: (c) => <Box sx={{ fontWeight: 500 }}>{c.municipality}</Box>,
            },
            {
              key: 'mainChallenge',
              label: t('naf.col.challenge'),
              render: (c) => c.mainChallenge || '—',
            },
            {
              key: 'urgentNeeds',
              label: t('naf.col.urgentNeeds'),
              render: (c) => c.urgentNeeds || '—',
            },
          ]}
          rows={recentComments}
        />
      )}

      {muniNames.length > 0 && (
        <>
          <SectionHeading>{t('naf.sec.byMunicipality')}</SectionHeading>
          <FilterPillGroup label={t('naf.sec.byMunicipality')} spacing={0.7}>
            {muniNames.map((name) => (
              <FilterPill
                key={name}
                active={selectedMuni === name}
                onClick={() => setSelectedMuni((s) => s === name ? null : name)}
              >
                {name}
              </FilterPill>
            ))}
          </FilterPillGroup>

          {selectedMuni && byMunicipality[selectedMuni] && (() => {
            const m = byMunicipality[selectedMuni];
            const muniSevData = SEVERITY_KEYS.map(dimKey => ({
              dimKey,
              data: m.weeks.map(w => ({
                label: w.week == null ? formatDate(w.dateFrom) : `W${w.week}`,
                [tSev('high')]:   w.severity[dimKey] === 'high'   ? 1 : 0,
                [tSev('medium')]: w.severity[dimKey] === 'medium' ? 1 : 0,
                [tSev('low')]:    w.severity[dimKey] === 'low'    ? 1 : 0,
                [tSev('none')]:   w.severity[dimKey] === 'none'   ? 1 : 0,
              })),
            }));

            const challengeWeeks = m.weeks.filter((w) => w.freeText?.mainChallenge);
            return (
              <DetailPanel>
                <SummaryStack items={[{ label: t('naf.kpi.weeks'), value: m.weeks.length }]} />
                <ChartGrid>
                  {muniSevData.map(({ dimKey, data: chartData }) => (
                    <ChartCard key={dimKey} title={tDim(dimKey)}>
                      <BarChartFrame data={chartData} height={180} legend={false} yDomain={[0, 1]}>
                        {severityBars}
                      </BarChartFrame>
                    </ChartCard>
                  ))}
                </ChartGrid>
                {challengeWeeks.length > 0 && (
                  <GridTable
                    gridTemplateColumns="80px 1fr"
                    columns={[
                      {
                        key: 'week',
                        label: t('naf.col.week'),
                        render: (w) => (
                          <Box sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            {w.week == null ? formatDate(w.dateFrom) : `W${w.week}`}
                          </Box>
                        ),
                      },
                      {
                        key: 'challenge',
                        label: t('naf.col.challenge'),
                        render: (w) => w.freeText.mainChallenge,
                      },
                    ]}
                    rows={challengeWeeks}
                  />
                )}
              </DetailPanel>
            );
          })()}
        </>
      )}
    </Box>
  );
}
