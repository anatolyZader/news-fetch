import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import styles from './MunicipalitiesTab.module.css';

// ─── Score → color helpers ───────────────────────────────────────────────────
function scoreColor(avg) {
  if (avg == null) return 'var(--muted)';
  if (avg >= 0.8) return '#16a34a';
  if (avg >= 0.6) return '#65a30d';
  if (avg >= 0.4) return '#ca8a04';
  if (avg >= 0.2) return '#ea580c';
  return '#dc2626';
}

function scoreBg(avg) {
  if (avg == null) return 'transparent';
  if (avg >= 0.8) return 'rgba(22,163,74,0.12)';
  if (avg >= 0.6) return 'rgba(101,163,13,0.12)';
  if (avg >= 0.4) return 'rgba(202,138,4,0.12)';
  if (avg >= 0.2) return 'rgba(234,88,12,0.12)';
  return 'rgba(220,38,38,0.12)';
}

function pct(v) {
  return v != null ? Math.round(v * 100) + '%' : '—';
}

function formatDate(dateStr, lang) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (lang === 'he') return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ──���────────────────────────────────────────────────────────────
export function MunicipalitiesTab() {
  const { getIdToken, apiReady } = useAuth();
  const { lang } = useLanguage();
  const isHe = lang === 'he';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedMuni, setSelectedMuni] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const r = await fetch('/api/municipalities', { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setData(json);
      if (json.days?.length) setSelectedDate(json.days[json.days.length - 1].date);
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => { if (apiReady) load(); }, [apiReady, load]);

  const day = useMemo(() => {
    if (!data?.days || !selectedDate) return null;
    return data.days.find((d) => d.date === selectedDate) ?? null;
  }, [data, selectedDate]);

  const compNames = useMemo(() => {
    if (!data) return {};
    return isHe ? data.componentNames.he : data.componentNames.en;
  }, [data, isHe]);

  // Find selected municipality data across all days (for trend)
  const muniAllDays = useMemo(() => {
    if (!data?.days || !selectedMuni) return [];
    return data.days.map((d) => {
      const m = d.municipalities.find((m) => m.name === selectedMuni);
      return m ? { date: d.date, ...m } : null;
    }).filter(Boolean);
  }, [data, selectedMuni]);

  const muniDay = useMemo(() => {
    if (!day || !selectedMuni) return null;
    return day.municipalities.find((m) => m.name === selectedMuni) ?? null;
  }, [day, selectedMuni]);

  // District averages for the selected day
  const districtAvg = useMemo(() => {
    if (!data?.districtTrend || !selectedDate) return null;
    return data.districtTrend.find((d) => d.date === selectedDate)?.avgByComponent ?? null;
  }, [data, selectedDate]);

  if (loading) return <p className={styles.hint}>{isHe ? 'טוען נתונים...' : 'Loading data...'}</p>;
  if (error) return <p className={styles.error}>{isHe ? 'שגיאה' : 'Error'}: {error}</p>;
  if (!data?.days?.length) return <p className={styles.hint}>{isHe ? 'אין נתוני רשויות' : 'No municipality data available.'}</p>;

  const comps = data.componentsOrder;

  return (
    <div className={styles.container} dir={isHe ? 'rtl' : 'ltr'}>

      {/* Header + date selector */}
      <div className={styles.dashHeader}>
        <div>
          <h2 className={styles.dashTitle}>{isHe ? 'דוחות רשויות — קה"א' : 'Municipality PBO Reports'}</h2>
          <p className={styles.dashSubtitle}>{isHe ? 'דיווחי קציני התנהגות אוכלוסייה' : 'Population Behavior Officer reports'}</p>
        </div>
        <div className={styles.datePills}>
          {data.days.map((d) => (
            <button
              key={d.date}
              type="button"
              className={`${styles.datePill} ${selectedDate === d.date ? styles.datePillActive : ''}`}
              onClick={() => { setSelectedDate(d.date); setSelectedMuni(null); }}
            >
              {formatDate(d.date, lang)} ({d.municipalities.length})
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      {day && (
        <div className={styles.kpiStrip}>
          <div className={styles.kpiCard}>
            <p className={styles.kpiLabel}>{isHe ? 'תאריך' : 'Date'}</p>
            <p className={styles.kpiValue}>{day.date}</p>
          </div>
          <div className={styles.kpiCard}>
            <p className={styles.kpiLabel}>{isHe ? 'רשויות' : 'Municipalities'}</p>
            <p className={styles.kpiValue}>{day.municipalities.length}</p>
          </div>
          {comps.map((cid) => (
            <div key={cid} className={styles.kpiCard}>
              <p className={styles.kpiLabel}>{compNames[cid]}</p>
              <p className={styles.kpiValue} style={{ color: scoreColor(districtAvg?.[cid]) }}>
                {pct(districtAvg?.[cid])}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Heatmap table */}
      {day && (
        <div className={styles.heatmapWrap}>
          <table className={styles.heatmap}>
            <thead>
              <tr>
                <th>{isHe ? 'רשות' : 'Municipality'}</th>
                {comps.map((cid) => <th key={cid}>{compNames[cid]}</th>)}
              </tr>
            </thead>
            <tbody>
              {day.municipalities.map((m) => (
                <tr
                  key={m.name}
                  onClick={() => setSelectedMuni(selectedMuni === m.name ? null : m.name)}
                  className={selectedMuni === m.name ? styles.rowSelected : ''}
                >
                  <td>{m.name}</td>
                  {comps.map((cid) => (
                    <td
                      key={cid}
                      className={styles.scoreCell}
                      style={{ color: scoreColor(m.components[cid].avg), background: scoreBg(m.components[cid].avg) }}
                    >
                      {pct(m.components[cid].avg)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {districtAvg && (
              <tfoot>
                <tr>
                  <td>{isHe ? 'ממוצע מחוזי' : 'District avg'}</td>
                  {comps.map((cid) => (
                    <td key={cid} style={{ color: scoreColor(districtAvg[cid]) }}>
                      {pct(districtAvg[cid])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Municipality detail panel */}
      {selectedMuni && muniDay && (
        <div className={styles.detail}>
          <div className={styles.detailHeader}>
            <span className={styles.detailName}>{selectedMuni} — {formatDate(selectedDate, lang)}</span>
            <button type="button" className={styles.detailClose} onClick={() => setSelectedMuni(null)}>
              {isHe ? 'סגור' : 'Close'}
            </button>
          </div>

          {comps.map((cid) => {
            const c = muniDay.components[cid];
            const avg = c.avg;
            const hasText = c.texts.some((t) => t.length > 0);
            return (
              <div
                key={cid}
                className={styles.compCard}
                style={{ borderInlineStartColor: scoreColor(avg) }}
              >
                <div className={styles.compHeader}>
                  <span className={styles.compName}>{compNames[cid]}</span>
                  <span
                    className={styles.compScore}
                    style={{ color: scoreColor(avg), background: scoreBg(avg) }}
                  >
                    {pct(avg)}
                  </span>
                </div>

                {/* Free text — primary content */}
                {hasText
                  ? c.texts.map((txt, i) => <p key={i} className={styles.compText}>{txt}</p>)
                  : <p className={styles.compNoText}>{isHe ? 'אין התייחסות מילולית' : 'No verbal reference provided'}</p>
                }

                {/* Individual question scores */}
                {c.scores.length > 0 && (
                  <div className={styles.compScores}>
                    {c.scores.map((s, i) => (
                      <div key={i} className={styles.compScoreItem}>
                        <span className={styles.scoreLabel}>{s.label}</span>
                        <span className={styles.scoreValue} style={{ color: scoreColor(s.value) }}>
                          {pct(s.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Multi-day text comparison — only show days where something changed */}
                {muniAllDays.length > 1 && (() => {
                  // Build list with change detection
                  const daysWithChange = muniAllDays.map((md, idx) => {
                    const mc = md.components[cid];
                    const prev = idx > 0 ? muniAllDays[idx - 1].components[cid] : null;
                    const changed = !prev
                      || mc.avg !== prev.avg
                      || mc.texts.join('|') !== prev.texts.join('|');
                    return { ...md, mc, changed };
                  });
                  const anyChange = daysWithChange.some((d, i) => i > 0 && d.changed);
                  return (
                    <details className={styles.trendDetails}>
                      <summary className={styles.trendSummary}>
                        {isHe ? 'השוואה בין ימים' : 'Compare across days'}
                        {!anyChange && (
                          <span className={styles.trendNoChange}>
                            {isHe ? ' — ללא שינוי' : ' — no change'}
                          </span>
                        )}
                      </summary>
                      {daysWithChange.map((md) => {
                        const { mc, changed } = md;
                        const mdTexts = mc.texts.filter((t) => t.length > 0);
                        return (
                          <div key={md.date} className={`${styles.trendDayBlock} ${!changed ? styles.trendDayUnchanged : ''}`}>
                            <div className={styles.trendDayHeader}>
                              <span className={styles.trendDate}>{formatDate(md.date, lang)}</span>
                              <span className={styles.trendVal} style={{ color: scoreColor(mc.avg) }}>{pct(mc.avg)}</span>
                              {!changed && <span className={styles.trendUnchangedBadge}>{isHe ? 'ללא שינוי' : 'unchanged'}</span>}
                            </div>
                            {changed && (
                              <>
                                {mdTexts.length > 0
                                  ? mdTexts.map((txt, i) => <p key={i} className={styles.compText}>{txt}</p>)
                                  : <p className={styles.compNoText}>{isHe ? 'אין התייחסות' : 'No text'}</p>
                                }
                                {mc.scores.length > 0 && (
                                  <div className={styles.compScores}>
                                    {mc.scores.map((s, i) => (
                                      <div key={i} className={styles.compScoreItem}>
                                        <span className={styles.scoreLabel}>{s.label}</span>
                                        <span className={styles.scoreValue} style={{ color: scoreColor(s.value) }}>
                                          {pct(s.value)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </details>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
