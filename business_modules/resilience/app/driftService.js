import { readResilienceHistory } from '../infrastructure/reportHistoryReader.js';
import { COMPONENT_IDS } from '../domain/services/behaviorSignals.js';

/**
 * Aggregates report history + overrides into the data shape consumed by the
 * drift dashboard (N4).
 *
 * Output:
 *   {
 *     scope, days, end_date, dates: [...],
 *     overall_series: [{date, score}],
 *     per_component: { [component_id]: { series: [{date, score, confidence, polarization}] } },
 *     signal_volume_per_day: [{date, total, by_type: {[signal_type]: count}}],
 *     source_share_per_day: [{date, total, by_source_type: {[source]: count}}],
 *     overrides: {
 *       total: number,
 *       by_component: {[component_id]: count},
 *       per_day: [{date, count}],
 *       rate: number  // total_overrides / total_components_with_data
 *     }
 *   }
 */
export function createDriftService({ overridesService, reportsDir, historyReader } = {}) {
  const reader = historyReader ?? readResilienceHistory;

  function compute({ scope = 'national', days = 30, endDate } = {}) {
    const history = reader({ scope, days, endDate, reportsDir });
    const dates = history.map((r) => r.date);

    const overall_series = history.map((r) => ({ date: r.date, score: r.overall_score }));

    const per_component = {};
    for (const id of COMPONENT_IDS) {
      const series = history.map((r) => {
        const c = r.components.find((cc) => cc.component_id === id);
        return {
          date: r.date,
          score: c?.score ?? null,
          confidence: c?.confidence ?? null,
          polarization: c?.polarization ?? null,
        };
      });
      per_component[id] = { series };
    }

    const signal_volume_per_day = history.map((r) => {
      const total = Object.values(r.signal_counts).reduce((s, n) => s + n, 0);
      return { date: r.date, total, by_type: r.signal_counts };
    });

    const source_share_per_day = history.map((r) => {
      const total = Object.values(r.source_type_mass).reduce((s, n) => s + n, 0);
      return { date: r.date, total, by_source_type: r.source_type_mass };
    });

    let overridesByComponent = {};
    let perDayOverrides = [];
    let totalOverrides = 0;
    if (overridesService) {
      const aggCounts = {};
      for (const date of dates) {
        const counts = overridesService.countByComponent({ date, scope });
        let dayTotal = 0;
        for (const [cid, n] of Object.entries(counts)) {
          aggCounts[cid] = (aggCounts[cid] || 0) + n;
          dayTotal += n;
        }
        perDayOverrides.push({ date, count: dayTotal });
        totalOverrides += dayTotal;
      }
      overridesByComponent = aggCounts;
    } else {
      perDayOverrides = dates.map((d) => ({ date: d, count: 0 }));
    }

    let totalComponentsWithData = 0;
    for (const r of history) {
      for (const c of r.components) {
        if (c.score != null) totalComponentsWithData++;
      }
    }
    const rate = totalComponentsWithData > 0 ? totalOverrides / totalComponentsWithData : 0;

    return {
      scope,
      days,
      end_date: endDate ?? (dates[dates.length - 1] ?? null),
      dates,
      overall_series,
      per_component,
      signal_volume_per_day,
      source_share_per_day,
      overrides: {
        total: totalOverrides,
        by_component: overridesByComponent,
        per_day: perDayOverrides,
        rate: Number(rate.toFixed(3)),
      },
    };
  }

  return { compute };
}
