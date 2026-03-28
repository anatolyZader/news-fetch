import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
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

const BAR_COLOR = '#2563eb';
const AGE_KEYS = ['nursery', 'elementary', 'highschool'];

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
      copingDist:          countValues(rows.map(r => r.copingLevel)),
      interruptionDist:    countValues(rows.map(r => r.interruptionFreq)),
      streetMovementDist:  countValues(rows.map(r => r.streetMovement)),
      informalContactDist: countValues(rows.map(r => r.informalContactFreq)),
    };
  });
  const dist = {
    ageRanges:           countValues(sorted.flatMap(r => r.ageRanges)),
    activityType:        countValues(sorted.flatMap(r => r.activityType)),
    activityHours:       countValues(sorted.flatMap(r => r.activityHours)),
    copingExpression:    countValues(sorted.flatMap(r => r.copingExpression)),
    streetMovement:      countValues(sorted.map(r => r.streetMovement)),
    informalContactFreq: countValues(sorted.map(r => r.informalContactFreq)),
    interruptionFreq:    countValues(sorted.map(r => r.interruptionFreq)),
    concerningTrends:    countValues(sorted.flatMap(r => r.concerningTrends)),
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
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} cursor={{ fill: 'var(--bg)' }} />
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} name={label} />
      </BarChart>
    </ResponsiveContainer>
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
      high: t('freq.high'), low: t('freq.low'), rarely: t('freq.rarely'), unknown: t('freq.unknown'),
      nursery: t('age.nursery'), elementary: t('age.elementary'), highschool: t('age.highschool'),
      educational: t('activity.educational'), relief: t('activity.relief'),
      behavior: t('expression.behavior'), discourse: t('expression.discourse'), cooperation: t('expression.cooperation'),
      drugs: t('trend.drugs'), alcohol: t('trend.alcohol'), violence: t('trend.violence'), screens: t('trend.screens'),
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

  const { summary, recentComments, bySettlement = {} } = data;
  const settlementNames = Object.keys(bySettlement).sort();

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = [
    { label: t('edu.kpi.total'),       value: summary.totalResponses },
    { label: t('edu.kpi.latest'),      value: formatDate(summary.latestDate, lang) },
    { label: t('edu.kpi.dateRange'),   value: `${formatDate(summary.dateRange.from, lang)} – ${formatDate(summary.dateRange.to, lang)}` },
    { label: t('edu.kpi.settlements'), value: summary.settlements.join(', ') || '—' },
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
          { title: t('edu.chart.street'),        distKey: 'streetMovementDist',  stackId: 'street'  },
          { title: t('edu.chart.contact'),       distKey: 'informalContactDist', stackId: 'contact' },
          { title: t('edu.chart.interruptions'), distKey: 'interruptionDist',    stackId: 'int'     },
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

      {/* ── Secondary metrics (collapsible) ─────────────────────────────── */}
      <details className={styles.secondaryDetails}>
        <summary className={styles.secondarySummary}>{t('edu.sec.secondary')}</summary>
        <div className={styles.secondaryTable}>
          {[
            { label: t('edu.chart.ageRanges'),    dist: dist.ageRanges },
            { label: t('edu.chart.activityType'), dist: dist.activityType },
            { label: t('edu.chart.activityHours'),dist: dist.activityHours },
            { label: t('edu.chart.expression'),   dist: dist.copingExpression },
            { label: t('edu.chart.trends'),        dist: dist.concerningTrends },
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

      {/* ── Open Responses ──────────────────────────────────────────────── */}
      <SectionHeading>{t('edu.sec.comments')}</SectionHeading>
      {recentComments.length === 0 ? (
        <p className={styles.hint}>{t('edu.comments.empty')}</p>
      ) : (
        <div className={styles.commentsTable}>
          <div className={styles.commentHeader}>
            <span>{t('edu.col.date')}</span>
            <span>{t('edu.col.settlement')}</span>
            <span>{t('edu.col.comment')}</span>
          </div>
          {recentComments.map((c, i) => (
            <div key={i} className={styles.commentRow}>
              <span className={styles.commentDate}>{formatDate(c.date, lang)}</span>
              <span className={styles.commentSettlement}>{c.settlement || '—'}</span>
              <span className={styles.commentText}>{c.comment}</span>
            </div>
          ))}
        </div>
      )}

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
                    { title: t('edu.chart.interruptions'), distKey: 'interruptionDist',    stackId: 'int'     },
                    { title: t('edu.chart.street'),        distKey: 'streetMovementDist',  stackId: 'street'  },
                    { title: t('edu.chart.contact'),       distKey: 'informalContactDist', stackId: 'contact' },
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

                {s.comments.length > 0 && (
                  <div className={styles.commentsTable}>
                    <div className={`${styles.commentHeader} ${styles.commentHeaderSettlement}`}>
                      <span>{t('edu.col.date')}</span>
                      <span>{t('edu.col.comment')}</span>
                    </div>
                    {s.comments.map((c, i) => (
                      <div key={i} className={`${styles.commentRow} ${styles.commentRowSettlement}`}>
                        <span className={styles.commentDate}>{formatDate(c.date, lang)}</span>
                        <span className={styles.commentText}>{c.comment}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
