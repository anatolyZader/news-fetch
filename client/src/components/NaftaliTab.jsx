import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import styles from './EducationTab.module.css';

// ─── Colour palette ──────────────────────────────────────────────────────────
const SEVERITY_COLORS = {
  high:    '#dc2626',
  medium:  '#ca8a04',
  low:     '#16a34a',
  none:    '#6b7280',
  unknown: '#9ca3af',
};

const VULN_COLORS = [
  '#dc2626', '#ca8a04', '#2563eb', '#7c3aed', '#059669', '#d97706',
];

const VULN_KEYS = [
  'physicalDisability', 'mentalDisability', 'specialEducation',
  'domesticViolence', 'severeFinancial', 'singleParent',
];

const SEVERITY_KEYS = [
  'financialRequests', 'schoolMentalHealth', 'communityMentalHealth',
  'parentalStress', 'coupleConflicts', 'parentChildConflicts',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatWeekLabel(trend, lang) {
  if (trend.week != null) return `W${trend.week}`;
  if (trend.dateFrom) {
    const d = new Date(trend.dateFrom + 'T00:00:00');
    if (lang === 'he' || lang === 'ru') return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return '?';
}

function formatDate(dateStr, lang) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (lang === 'he' || lang === 'ru') return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Sub-components ──────────────────────────────────────────────────────────
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

// ─── Main component ──────────────────────────────────────────────────────────
export function NaftaliTab() {
  const { getIdToken, apiReady } = useAuth();
  const { lang, t } = useLanguage();

  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
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

  useEffect(() => { if (apiReady) load(); }, [apiReady, load]);

  // Filter trends by selected municipalities
  const filteredTrends = useMemo(() => {
    if (!data?.weeks || muniFilter.size === 0) return data?.trends ?? [];
    // Recompute trends from filtered responses
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

  // ── Early returns ──────────────────────────────────────────────────────────
  if (loading) return <p className={styles.hint}>{t('naf.loading')}</p>;
  if (error)   return <p className={styles.error}>{t('naf.error')}: {error}</p>;
  if (!data?.summary) return <div className={styles.empty}><p>{t('naf.noData')}</p></div>;

  const { summary, recentComments = [], byMunicipality = {} } = data;
  const muniNames = data.municipalities ?? [];

  const kpis = [
    { label: t('naf.kpi.totalResponses'), value: summary.totalResponses },
    { label: t('naf.kpi.weeks'),          value: summary.totalWeeks },
    { label: t('naf.kpi.municipalities'), value: muniNames.length },
    { label: t('naf.kpi.dateRange'),      value: summary.dateRange ? `${formatDate(summary.dateRange.from, lang)} – ${formatDate(summary.dateRange.to, lang)}` : '—' },
  ];

  // ── Chart data: severity over time ─────────────────────────────────────────
  const severityChartData = SEVERITY_KEYS.map(dimKey => ({
    dimKey,
    data: filteredTrends.map(tr => {
      const d = tr.severityDist?.[dimKey] ?? {};
      return {
        label: formatWeekLabel(tr, lang),
        [tSev('high')]:    d.high    ?? 0,
        [tSev('medium')]:  d.medium  ?? 0,
        [tSev('low')]:     d.low     ?? 0,
        [tSev('none')]:    d.none    ?? 0,
      };
    }),
  }));

  // ── Chart data: vulnerable populations over time ───────────────────────────
  const vulnChartData = filteredTrends.map(tr => {
    const row = { label: formatWeekLabel(tr, lang) };
    for (const key of VULN_KEYS) row[tVuln(key)] = tr.vulnTotals?.[key] ?? 0;
    return row;
  });

  return (
    <div className={styles.container} dir={lang === 'he' ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className={styles.dashHeader}>
        <div>
          <h2 className={styles.dashTitle}>{t('naf.title')}</h2>
          <p className={styles.dashSubtitle}>{t('naf.subtitle')}</p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={() => load()}>
          {t('naf.refresh')}
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

      {/* Municipality filter */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterGroupLabel}>{t('naf.filter.municipality')}</span>
          <div className={styles.filterPills}>
            {muniNames.map(name => (
              <button
                key={name}
                type="button"
                className={`${styles.filterPill} ${muniFilter.has(name) ? styles.filterPillActive : ''}`}
                onClick={() => toggleSet(setMuniFilter, name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        {muniFilter.size > 0 && (
          <div className={styles.filterStatus}>
            <span className={styles.filterCount}>{t('naf.filter.showing').replace('{n}', muniFilter.size).replace('{total}', muniNames.length)}</span>
            <button type="button" className={styles.filterClear} onClick={() => setMuniFilter(new Set())}>
              {t('naf.filter.clear')}
            </button>
          </div>
        )}
      </div>

      {/* ── Severity trend charts ──────────────────────────────────────────── */}
      <SectionHeading>{t('naf.sec.severity')}</SectionHeading>
      <div className={styles.chartGrid2}>
        {severityChartData.map(({ dimKey, data: chartData }) => (
          <ChartCard key={dimKey} title={tDim(dimKey)}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={18} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey={tSev('high')}   stackId="s" fill={SEVERITY_COLORS.high}   />
                <Bar dataKey={tSev('medium')} stackId="s" fill={SEVERITY_COLORS.medium} />
                <Bar dataKey={tSev('low')}    stackId="s" fill={SEVERITY_COLORS.low}    />
                <Bar dataKey={tSev('none')}   stackId="s" fill={SEVERITY_COLORS.none}   />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}
      </div>

      {/* ── Vulnerable populations chart ───────────────────────────────────── */}
      <SectionHeading>{t('naf.sec.vulnerable')}</SectionHeading>
      <ChartCard title={t('naf.chart.vulnOverTime')}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={vulnChartData} barSize={18} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {VULN_KEYS.map((key, i) => (
              <Bar key={key} dataKey={tVuln(key)} fill={VULN_COLORS[i]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Recent comments ────────────────────────────────────────────────── */}
      <SectionHeading>{t('naf.sec.comments')}</SectionHeading>
      {recentComments.length === 0 ? (
        <p className={styles.hint}>{t('naf.comments.empty')}</p>
      ) : (
        <div className={styles.commentsTable}>
          <div className={styles.commentHeader}>
            <span>{t('naf.col.municipality')}</span>
            <span>{t('naf.col.challenge')}</span>
            <span>{t('naf.col.urgentNeeds')}</span>
          </div>
          {recentComments.map((c, i) => (
            <div key={i} className={styles.commentRow}>
              <span className={styles.commentSettlement}>{c.municipality}</span>
              <span className={styles.commentText}>{c.mainChallenge || '—'}</span>
              <span className={styles.commentText}>{c.urgentNeeds || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Per-Municipality Analysis ──────────────────────────────────────── */}
      {muniNames.length > 0 && (
        <>
          <SectionHeading>{t('naf.sec.byMunicipality')}</SectionHeading>
          <div className={styles.settlementSelector}>
            {muniNames.map(name => (
              <button
                key={name}
                type="button"
                className={`${styles.settlementBtn} ${selectedMuni === name ? styles.settlementBtnActive : ''}`}
                onClick={() => setSelectedMuni(s => s === name ? null : name)}
              >
                {name}
              </button>
            ))}
          </div>

          {selectedMuni && byMunicipality[selectedMuni] && (() => {
            const m = byMunicipality[selectedMuni];
            const muniSevData = SEVERITY_KEYS.map(dimKey => ({
              dimKey,
              data: m.weeks.map(w => ({
                label: w.week != null ? `W${w.week}` : formatDate(w.dateFrom, lang),
                [tSev('high')]:   w.severity[dimKey] === 'high'   ? 1 : 0,
                [tSev('medium')]: w.severity[dimKey] === 'medium' ? 1 : 0,
                [tSev('low')]:    w.severity[dimKey] === 'low'    ? 1 : 0,
                [tSev('none')]:   w.severity[dimKey] === 'none'   ? 1 : 0,
              })),
            }));

            return (
              <div className={styles.settlementDetail}>
                <div className={styles.settlementKpis}>
                  <div className={styles.skpi}>
                    <p className={styles.skpiLabel}>{t('naf.kpi.weeks')}</p>
                    <p className={styles.skpiValue}>{m.weeks.length}</p>
                  </div>
                </div>

                <div className={styles.chartGrid2}>
                  {muniSevData.map(({ dimKey, data: chartData }) => (
                    <ChartCard key={dimKey} title={tDim(dimKey)}>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={chartData} barSize={18} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} domain={[0, 1]} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
                          <Bar dataKey={tSev('high')}   stackId="s" fill={SEVERITY_COLORS.high}   />
                          <Bar dataKey={tSev('medium')} stackId="s" fill={SEVERITY_COLORS.medium} />
                          <Bar dataKey={tSev('low')}    stackId="s" fill={SEVERITY_COLORS.low}    />
                          <Bar dataKey={tSev('none')}   stackId="s" fill={SEVERITY_COLORS.none}   />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  ))}
                </div>

                {/* Municipality free-text */}
                {m.weeks.filter(w => w.freeText?.mainChallenge).length > 0 && (
                  <div className={styles.commentsTable}>
                    <div className={`${styles.commentHeader} ${styles.commentHeaderSettlement}`}>
                      <span>{t('naf.col.week')}</span>
                      <span>{t('naf.col.challenge')}</span>
                    </div>
                    {m.weeks.filter(w => w.freeText?.mainChallenge).map((w, i) => (
                      <div key={i} className={`${styles.commentRow} ${styles.commentRowSettlement}`}>
                        <span className={styles.commentDate}>{w.week != null ? `W${w.week}` : formatDate(w.dateFrom, lang)}</span>
                        <span className={styles.commentText}>{w.freeText.mainChallenge}</span>
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
