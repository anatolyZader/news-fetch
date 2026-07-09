const METRIC = 'resilience.scope.default_north_fallback';

/** @type {import('../../../../../cross-cut-modules/monitoring/domain/ports/IMetricsPort.js').noopMetricsPort | null} */
let metricsPort = null;

/**
 * @param {import('../../../../../cross-cut-modules/monitoring/domain/ports/IMetricsPort.js').noopMetricsPort | null} port
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
  } else if (assessment && typeof assessment === 'object') {
    assessment.default_district_signal_count = 0;
  }
  return count;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function defaultNorthGateThresholdPct(env = process.env) {
  const n = Number.parseFloat(env.RESILIENCE_DEFAULT_NORTH_GATE_PCT ?? '30');
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100) : 30;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function defaultNorthGateBlockEnabled(env = process.env) {
  const v = env.RESILIENCE_DEFAULT_NORTH_GATE_BLOCK;
  if (v == null || v === '') return true;
  return v !== '0' && v !== 'false' && v !== 'off';
}

/**
 * @param {object[]} scopedSignals
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ count: number, pct: number, blocked: boolean, thresholdPct: number, blockEnabled: boolean }}
 */
export function evaluateDefaultNorthGate(scopedSignals, env = process.env) {
  const count = (scopedSignals ?? []).filter(
    (s) => s?.scopeDecision?.source === 'default_north_district',
  ).length;
  const total = Math.max((scopedSignals ?? []).length, 1);
  const pct = Math.round((count / total) * 1000) / 10;
  const thresholdPct = defaultNorthGateThresholdPct(env);
  const blockEnabled = defaultNorthGateBlockEnabled(env);
  const blocked = blockEnabled && pct > thresholdPct;
  return { count, pct, blocked, thresholdPct, blockEnabled };
}
