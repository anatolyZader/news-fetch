import { readResilienceHistory } from '../infrastructure/reportHistoryReader.js';
import { COMPONENT_IDS } from '../domain/services/behaviorSignals.js';

/**
 * Aggregates report history into the data shape consumed by the drift dashboard (N4).
 */
export function createDriftService({ reportsDir, historyReader } = {}) {
  const reader = historyReader ?? readResilienceHistory;

  function isoRangeInclusive(endIso, days) {
    const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 1;
    const [y, m, d] = String(endIso ?? '').split('-').map((s) => Number.parseInt(s, 10));
    const end = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
      ? new Date(Date.UTC(y, m - 1, d))
      : new Date();
    const out = [];
    const start = new Date(end.getTime());
    start.setUTCDate(start.getUTCDate() - (safeDays - 1));
    for (let i = 0; i < safeDays; i++) {
      const cur = new Date(start.getTime());
      cur.setUTCDate(cur.getUTCDate() + i);
      out.push(cur.toISOString().slice(0, 10));
    }
    return out;
  }

  /**
   * Fill null scores between two known scores with linear steps (one gap ⇒ midpoint).
   * Leading/trailing nulls stay null (no anchor on one side).
   * @param {Array<{ date: string, score: number | null }>} points
   */
  function interpolateScoreGaps(points) {
    const arr = points.map((p) => ({ ...p }));
    const n = arr.length;
    let i = 0;
    while (i < n) {
      while (i < n && arr[i].score != null && !Number.isNaN(arr[i].score)) i++;
      if (i >= n) break;
      const gapStart = i;
      while (i < n && (arr[i].score == null || Number.isNaN(arr[i].score))) i++;
      const gapEnd = i - 1;
      const prevIdx = gapStart - 1;
      const nextIdx = i;
      if (prevIdx < 0 || nextIdx >= n) continue;
      const v0 = arr[prevIdx].score;
      const v1 = arr[nextIdx].score;
      if (v0 == null || v1 == null || Number.isNaN(v0) || Number.isNaN(v1)) continue;
      const count = gapEnd - gapStart + 1;
      for (let k = 1; k <= count; k++) {
        const t = k / (count + 1);
        const v = v0 + (v1 - v0) * t;
        arr[gapStart + k - 1] = {
          ...arr[gapStart + k - 1],
          score: Math.round(v * 10) / 10,
          score_interpolated: true,
        };
      }
    }
    return arr;
  }

  function compute({ scope = 'national', days = 30, endDate } = {}) {
    const historyRaw = reader({ scope, days, endDate, reportsDir });
    const effectiveEndDate = endDate ?? (historyRaw[historyRaw.length - 1]?.date ?? null);
    const dateWindow =
      effectiveEndDate && typeof effectiveEndDate === 'string'
        ? isoRangeInclusive(effectiveEndDate, days)
        : (historyRaw.map((r) => r.date));

    const byDate = new Map(historyRaw.map((r) => [r.date, r]));
    const history = dateWindow.map((date) => (
      byDate.get(date) ?? {
        date,
        scope,
        total_articles_analyzed: 0,
        overall_score: null,
        components: [],
        signal_counts: {},
        source_type_mass: {},
      }
    ));
    const dates = history.map((r) => r.date);

    const overall_series_raw = history.map((r) => ({ date: r.date, score: r.overall_score }));
    const overall_series = interpolateScoreGaps(overall_series_raw);

    const per_component = {};
    for (const id of COMPONENT_IDS) {
      const seriesRaw = history.map((r) => {
        const c = r.components.find((cc) => cc.component_id === id);
        return {
          date: r.date,
          score: c?.score ?? null,
          confidence: c?.confidence ?? null,
          certainty: c?.certainty ?? null,
          polarization: c?.polarization ?? null,
          erosion_index: c?.erosion_index ?? null,
          z_score_chronic: c?.z_score_chronic ?? null,
        };
      });
      const series = interpolateScoreGaps(seriesRaw);
      per_component[id] = { series };
    }

    const daily_mean_polarization = history.map((r) => {
      const vals = r.components
        .map((c) => c.polarization)
        .filter((v) => typeof v === 'number' && !Number.isNaN(v));
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { date: r.date, mean };
    });

    const daily_mean_certainty = history.map((r) => {
      const vals = r.components
        .map((c) => c.certainty)
        .filter((v) => typeof v === 'number' && !Number.isNaN(v));
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { date: r.date, mean };
    });

    const daily_mean_erosion = history.map((r) => {
      const vals = r.components
        .map((c) => c.erosion_index)
        .filter((v) => typeof v === 'number' && !Number.isNaN(v));
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { date: r.date, mean };
    });

    const daily_mean_chronic_z = history.map((r) => {
      const vals = r.components
        .map((c) => c.z_score_chronic)
        .filter((v) => typeof v === 'number' && !Number.isNaN(v));
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { date: r.date, mean };
    });

    const signal_volume_per_day = history.map((r) => {
      const total = Object.values(r.signal_counts).reduce((s, n) => s + n, 0);
      return { date: r.date, total, by_type: r.signal_counts };
    });

    const source_share_per_day = history.map((r) => {
      const total = Object.values(r.source_type_mass).reduce((s, n) => s + n, 0);
      return { date: r.date, total, by_source_type: r.source_type_mass };
    });

    const polAlertTh = Number.parseFloat(process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION ?? '0.7');
    const polWindowRaw = Number.parseInt(process.env.RESILIENCE_DRIFT_POLARIZATION_WINDOW ?? '3', 10);
    const polWindow = Number.isFinite(polWindowRaw)
      ? Math.min(14, Math.max(1, polWindowRaw))
      : 3;
    const alerts = [];
    const tailPolValues = daily_mean_polarization
      .slice(-polWindow)
      .map((d) => d.mean)
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));
    const recentMeanPol = tailPolValues.length
      ? tailPolValues.reduce((a, b) => a + b, 0) / tailPolValues.length
      : null;
    if (typeof recentMeanPol === 'number' && !Number.isNaN(recentMeanPol) && recentMeanPol > polAlertTh) {
      alerts.push({
        level: 'warning',
        code: 'high_mean_polarization',
        polarization_window_days: polWindow,
        message: `${polWindow}-day mean polarization ${recentMeanPol.toFixed(2)} exceeds ${polAlertTh}.`,
      });
    }

    const latest = history[history.length - 1];
    if (latest?.components?.length) {
      for (const c of latest.components) {
        if (c.z_score_chronic != null && c.z_score_chronic <= -2) {
          alerts.push({
            level: 'warning',
            code: 'long_term_degradation_warning',
            component_id: c.component_id,
            message: `Chronic baseline z=${c.z_score_chronic} for ${c.component_id}.`,
          });
        }
        if (c.erosion_index != null && c.erosion_index > 0.35) {
          alerts.push({
            level: 'info',
            code: 'erosion_elevated',
            component_id: c.component_id,
            message: `Erosion index ${c.erosion_index} for ${c.component_id}.`,
          });
        }
      }
    }

    return {
      scope,
      days,
      end_date: endDate ?? (dates[dates.length - 1] ?? null),
      dates,
      overall_series,
      per_component,
      daily_mean_polarization,
      daily_mean_certainty,
      daily_mean_erosion,
      daily_mean_chronic_z,
      alerts,
      signal_volume_per_day,
      source_share_per_day,
    };
  }

  return { compute };
}
