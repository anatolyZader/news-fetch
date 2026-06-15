const METRIC = 'resilience.scope.default_north_fallback';

/** @type {import('../../../cross-cut-modules/monitoring/domain/ports/IMetricsPort.js').noopMetricsPort | null} */
let metricsPort = null;

/**
 * @param {import('../../../cross-cut-modules/monitoring/domain/ports/IMetricsPort.js').noopMetricsPort | null} port
 */
export function setScopeAttributionMetricsPort(port) {
  metricsPort = port;
}

export function recordDefaultNorthFallback(count = 1) {
  metricsPort?.increment(METRIC, count, { source: 'default_north_district' });
}

/**
 * @param {object[]} scopedSignals
 * @param {{ log?: boolean, assessment?: object }} [opts]
 * @returns {number}
 */
export function countAndLogDefaultNorthSignals(scopedSignals, opts = {}) {
  const { log = true, assessment = null } = opts;
  const count = (scopedSignals ?? []).filter(
    (s) => s?.scopeDecision?.source === 'default_north_district',
  ).length;
  if (count > 0) {
    recordDefaultNorthFallback(count);
    if (log) {
      console.error(
        `  ⚠ ${count} signal(s) used default-north district (no explicit district_id) — check extractor output`,
      );
    }
    if (assessment && typeof assessment === 'object') {
      assessment.default_district_signal_count = count;
    }
  }
  return count;
}
