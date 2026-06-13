/**
 * Shadow perturbed-weight sensitivity bands (±pct on SIGNAL_TO_COMPONENTS).
 */

import { scoreComponents } from './scoreComponentsOrchestrator.js';
import { defaultSignalWeights, perturbWeights } from './scoringOverrides.js';

const DEFAULT_PERTURB_PCT = 0.12;
const FRAGILE_BAND_WIDTH = 2;
const LOW_SEED = 0xC011BEEF;
const HIGH_SEED = 0xFEEDBEEF;

function isWeightSensitivityForced() {
  return process.env.RESILIENCE_WEIGHT_SENSITIVITY === '1';
}

/**
 * @param {object} opts
 * @param {object|null|undefined} opts.validationMaturity
 * @param {number} [opts.tier3Min]
 */
export function shouldComputeWeightSensitivity(opts = {}) {
  if (isWeightSensitivityForced()) return true;
  const tier3Min = opts.tier3Min ?? 30;
  const status = opts.validationMaturity?.tier_readiness?.tier3_tuning?.status;
  const recordCount = opts.validationMaturity?.collection?.record_count ?? 0;
  return status === 'enough_records_run_suggest_tuning' || recordCount >= tier3Min;
}

/**
 * @param {number|null} baseline
 * @param {number|null} low
 * @param {number|null} high
 */
export function buildWeightSensitivityBand(baseline, low, high) {
  const scores = [baseline, low, high].filter((v) => v != null && Number.isFinite(v));
  if (scores.length === 0) {
    return {
      baseline: baseline ?? null,
      perturbed_low: low ?? null,
      perturbed_high: high ?? null,
      band_width: null,
      fragile: false,
    };
  }
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const bandWidth = max - min;
  return {
    baseline: baseline ?? null,
    perturbed_low: low ?? null,
    perturbed_high: high ?? null,
    band_width: bandWidth,
    fragile: bandWidth >= FRAGILE_BAND_WIDTH,
  };
}

/**
 * @param {Record<string, object>} scoredBaseline
 * @param {Array} signals
 * @param {object} scoreOpts passed to scoreComponents (totalArticles, salienceContext, etc.)
 * @param {{ pct?: number, reliable?: boolean }} [opts]
 * @returns {Record<string, object>}
 */
export function computeWeightSensitivity(scoredBaseline, signals, scoreOpts, opts = {}) {
  const pct = opts.pct ?? DEFAULT_PERTURB_PCT;
  const reliable = opts.reliable === true;
  const baseMapping = defaultSignalWeights();
  const lowOverlay = perturbWeights(baseMapping, { pct, seed: LOW_SEED });
  const highOverlay = perturbWeights(baseMapping, { pct, seed: HIGH_SEED });

  const scoredLow = scoreComponents(signals, { ...scoreOpts, weightOverlay: lowOverlay });
  const scoredHigh = scoreComponents(signals, { ...scoreOpts, weightOverlay: highOverlay });

  const out = {};
  for (const id of Object.keys(scoredBaseline ?? {})) {
    const band = buildWeightSensitivityBand(
      scoredBaseline[id]?.score ?? null,
      scoredLow[id]?.score ?? null,
      scoredHigh[id]?.score ?? null,
    );
    out[id] = { ...band, reliable, perturb_pct: pct };
  }
  return out;
}

/**
 * @param {Record<string, object>} sensitivityByComponent
 */
export function summarizeWeightSensitivity(sensitivityByComponent) {
  const bands = Object.values(sensitivityByComponent ?? {})
    .filter((b) => b?.band_width != null && Number.isFinite(b.band_width));
  if (bands.length === 0) {
    return { mean_band_width: null, fragile_component_count: 0, component_count: 0 };
  }
  const mean = bands.reduce((s, b) => s + b.band_width, 0) / bands.length;
  const fragileCount = bands.filter((b) => b.fragile === true).length;
  return {
    mean_band_width: Math.round(mean * 100) / 100,
    fragile_component_count: fragileCount,
    component_count: bands.length,
  };
}

/**
 * Attach weight_sensitivity to each component in scored map.
 * @param {Record<string, object>} scoredComponents
 * @param {Array} signals
 * @param {object} scoreOpts
 * @param {{ validationMaturity?: object, tier3Min?: number }} [gateOpts]
 */
export function enrichWithWeightSensitivity(scoredComponents, signals, scoreOpts, gateOpts = {}) {
  const tier3Min = gateOpts.tier3Min ?? 30;
  const shouldRun = shouldComputeWeightSensitivity({
    validationMaturity: gateOpts.validationMaturity,
    tier3Min,
  });

  if (!shouldRun) {
    const out = {};
    for (const [id, c] of Object.entries(scoredComponents ?? {})) {
      out[id] = {
        ...c,
        weight_sensitivity: null,
        weight_sensitivity_note: 'requires_tier3_history',
      };
    }
    return {
      scored: out,
      weight_sensitivity_summary: null,
      weight_sensitivity_note: 'requires_tier3_history',
    };
  }

  const reliable = true;
  const sensitivityByComponent = computeWeightSensitivity(
    scoredComponents,
    signals,
    scoreOpts,
    { reliable },
  );
  const summary = summarizeWeightSensitivity(sensitivityByComponent);

  const scored = {};
  for (const [id, c] of Object.entries(scoredComponents ?? {})) {
    scored[id] = {
      ...c,
      weight_sensitivity: sensitivityByComponent[id] ?? null,
      weight_sensitivity_note: null,
    };
  }

  return {
    scored,
    weight_sensitivity_summary: summary,
    weight_sensitivity_note: null,
  };
}
