import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import styles from './EducationTab.module.css';

// ─── Colour palette ──────────────────────────────────────────────────────────
const COPING_COLORS = {
  indifferent:         '#6b7280',
  coping_easily:       '#16a34a',
  struggling_somewhat: '#ca8a04',
  struggling_greatly:  '#dc2626',
  other:               '#9ca3af',
};

const FREQ_COLORS = {
  high:    '#dc2626',
  low:     '#ca8a04',
  rarely:  '#16a34a',
  unknown: '#9ca3af',
};

const INTERVENTION_COLORS = {
  yes:     '#dc2626',
  no:      '#16a34a',
  maybe:   '#ca8a04',
  unknown: '#9ca3af',
};

const TREND_COLORS = {
  drugs:             '#7c3aed',
  alcohol:           '#dc2626',
  physical_violence: '#ea580c',
  verbal_violence:   '#f59e0b',
  screens:           '#2563eb',
  loneliness:        '#6b7280',
  none_observed:     '#16a34a',
};

const BAR_COLOR = '#2563eb';
const AGE_KEYS = ['toddlers', 'kindergarten', 'elementary', 'highschool'];

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function countValues(arr) {
  const out = {};
  for (const v of arr) { if (v) out[v] = (out[v] || 0) + 1; }
  return out;
}

function formatDate(dateStr, lang) {
  const d = new Date(dateStr + 'T00:00:00');
  if (lang === 'he' || lang === 'ru') {
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function distToChartData(dist, tLabel) {
  return Object.entries(dist)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => ({ name: tLabel(k), value: v }));
}

/** Recompute trends + distributions from an arbitrary filtered sessions array */
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

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionHeading({ children }) {
  return <h3 className={styles.sectionHeading}>{children}</h3>;
}

function ChartCard({ title, children }) {
  return (
    <div className={styles.chartCard}>
      <p className={styles.chartTitle}>{title}</p>
      {children}
    </div>
  );
}

function SimpleBarChart({ data, color = BAR_COLOR, yKey = 'value', label }) {
  const chartHeight = Math.max(180, data.length * 36 + 20);
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--fg, #1f2937)' }} width={120} interval={0} />
        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} cursor={{ fill: 'var(--bg)' }} />
        <Bar dataKey={yKey} fill={color} radius={[0, 4, 4, 0]} name={label} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CommentsTable({ comments, t, lang, showSettlement = true }) {
  if (!comments || comments.length === 0) {
    return <p className={styles.hint}>{t('edu.comments.empty')}</p>;
  }
  const headerClass = showSettlement ? styles.commentHeader : `${styles.commentHeader} ${styles.commentHeaderSettlement}`;
  const rowClass = showSettlement ? styles.commentRow : `${styles.commentRow} ${styles.commentRowSettlement}`;
  return (
    <div className={styles.commentsTable}>
      <div className={headerClass}>
        <span>{t('edu.col.date')}</span>
        {showSettlement && <span>{t('edu.col.settlement')}</span>}
        <span>{t('edu.col.comment')}</span>
      </div>
      {comments.map((c, i) => (
        <div key={i} className={rowClass}>
          <span className={styles.commentDate}>{formatDate(c.date, lang)}</span>
          {showSettlement && <span className={styles.commentSettlement}>{c.settlement || '—'}</span>}
          <span className={styles.commentText}>{c.comment}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EducationTab() {
  const { getIdToken, apiReady } = useAuth();
  const { lang, t } = useLanguage();

  // All hooks before any early return
  const [data, setData]                         = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState(null);
  const [ageFilter, setAgeFilter]               = useState(new Set());
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

  // Filter + re-aggregate whenever filter state or raw data changes
  const { trends, dist, filteredCount } = useMemo(() => {
    if (!data?.sessions) return { trends: [], dist: {}, filteredCount: 0 };
    let sessions = data.sessions;
    if (settlementFilter.size > 0) sessions = sessions.filter(s => settlementFilter.has(s.settlement));
    if (ageFilter.size > 0)        sessions = sessions.filter(s => s.ageRanges.some(a => ageFilter.has(a)));
    const { trends, dist } = aggregateSessions(sessions);
    return { trends, dist, filteredCount: sessions.length };
  }, [data, settlementFilter, ageFilter]);

  // Filter toggle helpers
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

  // ── Early returns ─────────────────────────────────────────────────────────
  if (loading) return <p className={styles.hint}>{t('edu.loading')}</p>;
  if (error)   return <p className={styles.error}>{t('edu.error')}: {error}</p>;
  if (!data?.summary) return <div className={styles.empty}><p>{t('edu.noData')}</p></div>;

  const { summary, recentComments, communityActivitiesComments = [], bySettlement = {} } = data;
  const settlementNames = Object.keys(bySettlement).sort();

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = [
    { label: t('edu.kpi.total'),       value: summary.totalResponses },
    { label: t('edu.kpi.latest'),      value: formatDate(summary.latestDate, lang) },
    { label: t('edu.kpi.dateRange'),   value: `${formatDate(summary.dateRange.from, lang)} – ${formatDate(summary.dateRange.to, lang)}` },
  ];

  // ── Chart data from filtered trends ───────────────────────────────────────
  const copingTrend = trends.map(d => {
    const row = { date: formatDate(d.date, lang) };
    for (const k of Object.keys(COPING_COLORS)) row[tKey(k)] = d.copingDist[k] ?? 0;
    return row;
  });

  const toChartData = (obj) => distToChartData(obj, tKey);

  // ── Per-settlement chart data ─────────────────────────────────────────────
  function settlementCharts(s) {
    const copingTrend = s.trends.map(d => {
      const row = { date: formatDate(d.date, lang) };
      for (const k of Object.keys(COPING_COLORS)) row[tKey(k)] = d.copingDist[k] ?? 0;
      return row;
    });
    const childrenTrend = s.trends.map(d => ({
      date: formatDate(d.date, lang),
      [t('edu.axis.children')]: d.avgChildren,
    }));
    const freqTrend = (distKey) => s.trends.map(d => ({
      date: formatDate(d.date, lang),
      [tKey('high')]:   d[distKey]?.high   ?? 0,
      [tKey('low')]:    d[distKey]?.low    ?? 0,
      [tKey('rarely')]: d[distKey]?.rarely ?? 0,
    }));
    return { copingTrend, childrenTrend, freqTrend };
  }

  // Intervention pie data
  const interventionData = toChartData(dist.interventionNeeded ?? {}).map(item => {
    const keyMap = { [tKey('yes')]: INTERVENTION_COLORS.yes, [tKey('no')]: INTERVENTION_COLORS.no, [tKey('maybe')]: INTERVENTION_COLORS.maybe };
    return { ...item, color: keyMap[item.name] || INTERVENTION_COLORS.unknown };
  });

  return (
    <div className={styles.container} dir={lang === 'he' ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className={styles.dashHeader}>
        <div>
          <h2 className={styles.dashTitle}>{t('edu.title')}</h2>
          <p className={styles.dashSubtitle}>{t('edu.subtitle')}</p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={() => load(true)}>
          {t('edu.refresh')}
        </button>
      </div>

      {/* KPI strip */}
      <div className={styles.kpiStrip}>
        {kpis.map(k => (
          <div key={k.label} className={styles.kpiCard}>
            <p className={styles.kpiLabel}>{k.label}</p>
            <p className={styles.kpiValue}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterGroupLabel}>{t('edu.filter.age')}</span>
          <div className={styles.filterPills}>
            {AGE_KEYS.map(k => (
              <button
                key={k}
                type="button"
                className={`${styles.filterPill} ${ageFilter.has(k) ? styles.filterPillActive : ''}`}
                onClick={() => toggleSet(setAgeFilter, k)}
              >
                {tKey(k)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterGroupLabel}>{t('edu.filter.settlement')}</span>
          <div className={styles.filterPills}>
            {settlementNames.map(name => (
              <button
                key={name}
                type="button"
                className={`${styles.filterPill} ${settlementFilter.has(name) ? styles.filterPillActive : ''}`}
                onClick={() => toggleSet(setSettlementFilter, name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {isFiltered && (
          <div className={styles.filterStatus}>
            <span className={styles.filterCount}>{t('edu.filter.showing').replace('{n}', filteredCount).replace('{total}', summary.totalResponses)}</span>
            <button type="button" className={styles.filterClear} onClick={clearFilters}>
              {t('edu.filter.clear')}
            </button>
          </div>
        )}
      </div>

      {/* ── Coping chart — full width primary ───────────────────────────── */}
      <SectionHeading>{t('edu.sec.trends')}</SectionHeading>
      <ChartCard title={t('edu.chart.coping')}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={copingTrend} barSize={18} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {Object.entries(COPING_COLORS).map(([k, color]) => (
              <Bar key={k} dataKey={tKey(k)} stackId="coping" fill={color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Supporting trend charts ──────────────────────────────────────── */}
      <div className={styles.chartGrid2}>
        {[
          { title: t('edu.chart.street'),  distKey: 'streetMovementDist',  stackId: 'street'  },
          { title: t('edu.chart.contact'), distKey: 'informalContactDist', stackId: 'contact' },
        ].map(({ title, distKey, stackId }) => {
          const trendData = trends.map(d => ({
            date: formatDate(d.date, lang),
            [tKey('high')]:   d[distKey]?.high   ?? 0,
            [tKey('low')]:    d[distKey]?.low    ?? 0,
            [tKey('rarely')]: d[distKey]?.rarely ?? 0,
          }));
          return (
            <ChartCard key={title} title={title}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} barSize={18} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey={tKey('high')}   stackId={stackId} fill={FREQ_COLORS.high}   />
                  <Bar dataKey={tKey('low')}    stackId={stackId} fill={FREQ_COLORS.low}    />
                  <Bar dataKey={tKey('rarely')} stackId={stackId} fill={FREQ_COLORS.rarely} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          );
        })}
      </div>

      {/* ── Concerning Trends + Exposure + Intervention ─────────────────── */}
      <SectionHeading>{t('edu.chart.trends')}</SectionHeading>
      <div className={styles.chartGrid2}>
        <ChartCard title={t('edu.chart.trends')}>
          <SimpleBarChart data={toChartData(dist.concerningTrends ?? {})} color="#ea580c" label={t('edu.axis.count')} />
        </ChartCard>
        <ChartCard title={t('edu.chart.exposure')}>
          <SimpleBarChart data={toChartData(dist.exposureMethod ?? {})} color="#7c3aed" label={t('edu.axis.count')} />
        </ChartCard>
      </div>
      <div className={styles.chartGrid2}>
        <ChartCard title={t('edu.chart.intervention')}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={interventionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}>
                {interventionData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Secondary metrics (collapsible) ─────────────────────────────── */}
      <details className={styles.secondaryDetails}>
        <summary className={styles.secondarySummary}>{t('edu.sec.secondary')}</summary>
        <div className={styles.secondaryTable}>
          {[
            { label: t('edu.chart.ageRanges'),    dist: dist.ageRanges },
            { label: t('edu.chart.activityType'), dist: dist.activityType },
            { label: t('edu.chart.activityHours'),dist: dist.activityHours },
          ].map(({ label, dist: d }) => {
            const total = Object.values(d ?? {}).reduce((s, v) => s + v, 0) || 1;
            const sorted = Object.entries(d ?? {}).sort(([, a], [, b]) => b - a);
            return (
              <div key={label} className={styles.secondaryRow}>
                <span className={styles.secondaryLabel}>{label}</span>
                <div className={styles.secondaryPills}>
                  {sorted.map(([k, v]) => (
                    <span key={k} className={styles.pill}>
                      {tKey(k)} <strong>{Math.round(v / total * 100)}%</strong>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      {/* ── Community Activities (free text) ───────────────────────────── */}
      <SectionHeading>{t('edu.sec.communityActivities')}</SectionHeading>
      <CommentsTable comments={communityActivitiesComments} t={t} lang={lang} />

      {/* ── Open Responses ──────────────────────────────────────────────── */}
      <SectionHeading>{t('edu.sec.comments')}</SectionHeading>
      <CommentsTable comments={recentComments} t={t} lang={lang} />

      {/* ── Per-Settlement Analysis ────────────────────────────────────── */}
      {settlementNames.length > 0 && (
        <>
          <SectionHeading>{t('edu.sec.bySettlement')}</SectionHeading>
          <div className={styles.settlementSelector}>
            {settlementNames.map(name => (
              <button
                key={name}
                type="button"
                className={`${styles.settlementBtn} ${selectedSettlement === name ? styles.settlementBtnActive : ''}`}
                onClick={() => setSelectedSettlement(s => s === name ? null : name)}
              >
                {name}
              </button>
            ))}
          </div>

          {selectedSettlement && bySettlement[selectedSettlement] && (() => {
            const s = bySettlement[selectedSettlement];
            const { copingTrend: sc, childrenTrend: ch, freqTrend } = settlementCharts(s);
            return (
              <div className={styles.settlementDetail}>
                <div className={styles.settlementKpis}>
                  <div className={styles.skpi}>
                    <p className={styles.skpiLabel}>{t('edu.kpi.total')}</p>
                    <p className={styles.skpiValue}>{s.totalResponses}</p>
                  </div>
                  <div className={styles.skpi}>
                    <p className={styles.skpiLabel}>{t('edu.kpi.dateRange')}</p>
                    <p className={styles.skpiValue}>
                      {s.sessionDates.length > 1
                        ? `${formatDate(s.sessionDates[0], lang)} – ${formatDate(s.sessionDates[s.sessionDates.length - 1], lang)}`
                        : formatDate(s.sessionDates[0], lang)}
                    </p>
                  </div>
                  <div className={styles.skpi}>
                    <p className={styles.skpiLabel}>{t('edu.kpi.sessions')}</p>
                    <p className={styles.skpiValue}>{s.sessionDates.length}</p>
                  </div>
                </div>

                <div className={styles.chartGrid2}>
                  <ChartCard title={t('edu.chart.coping')}>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={sc} barSize={18} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {Object.entries(COPING_COLORS).map(([k, color]) => (
                          <Bar key={k} dataKey={tKey(k)} stackId="coping" fill={color} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {[
                    { title: t('edu.chart.street'),  distKey: 'streetMovementDist',  stackId: 'street'  },
                    { title: t('edu.chart.contact'), distKey: 'informalContactDist', stackId: 'contact' },
                  ].map(({ title, distKey, stackId }) => (
                    <ChartCard key={title} title={title}>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={freqTrend(distKey)} barSize={18} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey={tKey('high')}   stackId={stackId} fill={FREQ_COLORS.high}   />
                          <Bar dataKey={tKey('low')}    stackId={stackId} fill={FREQ_COLORS.low}    />
                          <Bar dataKey={tKey('rarely')} stackId={stackId} fill={FREQ_COLORS.rarely} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  ))}

                  <ChartCard title={t('edu.chart.children')}>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={ch} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
                        <Line type="monotone" dataKey={t('edu.axis.children')} stroke={BAR_COLOR} strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {/* Per-settlement community activities */}
                {s.communityComments && s.communityComments.length > 0 && (
                  <>
                    <p className={styles.chartTitle}>{t('edu.sec.communityActivities')}</p>
                    <CommentsTable comments={s.communityComments} t={t} lang={lang} showSettlement={false} />
                  </>
                )}

                {s.comments.length > 0 && (
                  <>
                    <p className={styles.chartTitle}>{t('edu.sec.comments')}</p>
                    <CommentsTable comments={s.comments} t={t} lang={lang} showSettlement={false} />
                  </>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
