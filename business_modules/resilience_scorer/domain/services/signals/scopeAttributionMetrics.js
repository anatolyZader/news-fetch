/**
 * Scope attribution metrics and default-north quality gate for regional assessments.
 *
 * Pipeline position: assess — during scope filtering and post-scope quality checks.
 *
 * Owns: default-north fallback counters, gate threshold evaluation, assessment annotation.
 * Does NOT: district assignment (signalDistrictId.js), scope decisions (regionSignalFilter.js), or blocking logic elsewhere.
 *
 * Key collaborators: regionSignalFilter.js, signalDistrictId.js, evidenceEligibility.js, cross-cut-modules/monitoring/.
 */

const METRIC = 'resilience.scope.default_north_fallback';

/** @type {import('../../../../../cross-cut-modules/monitoring/domain/ports/IMetricsPort.js').noopMetricsPort | null} */
let metricsPort = null;

/**
 * Inject metrics port for default-north fallback counters (composition wiring).
 *
 * @param {import('../../../../../cross-cut-modules/monitoring/domain/ports/IMetricsPort.js').noopMetricsPort | null} port
 */
export function setScopeAttributionMetricsPort(port) {
  metricsPort = port;
}

/**
 * Increment the default-north fallback metric by count.
 *
 * @param {number} [count=1]
 */
export function recordDefaultNorthFallback(count = 1) {
  metricsPort?.increment(METRIC, count, { source: 'default_north_district' });
}

/**
 * Count scoped signals using default-north district, log warning, and annotate assessment.
 *
 * @param {object[]} scopedSignals signals after filterSignalsForScope
 * @param {{ log?: boolean, assessment?: object }} [opts]
 * @returns {number} count of default-north signals
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
 * Percentage threshold above which default-north share triggers gate (env RESILIENCE_DEFAULT_NORTH_GATE_PCT).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number} 0–100
 */
export function defaultNorthGateThresholdPct(env = process.env) {
  const n = Number.parseFloat(env.RESILIENCE_DEFAULT_NORTH_GATE_PCT ?? '30');
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100) : 30;
}

/**
 * Whether the default-north gate may block assessment (env RESILIENCE_DEFAULT_NORTH_GATE_BLOCK).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function defaultNorthGateBlockEnabled(env = process.env) {
  const v = env.RESILIENCE_DEFAULT_NORTH_GATE_BLOCK;
  if (v == null || v === '') return true;
  return v !== '0' && v !== 'false' && v !== 'off';
}

/**
 * Evaluate default-north share against gate threshold for scoped signals.
 *
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
