/**
 * Post-scoring enrichment: smoothed score + delta channel (blend, z-score,
 * dual-baseline extras) and epistemic enrichment (calibration deficit + shadow
 * weight sensitivity via the analyst scoring facade).
 */

import { getPeaceTimeAnchor, isDualBaselineEnabled } from '../../domain/epistemic/peaceTimeAnchors.js';
import { enrichWithCalibrationPenalty, enrichWithWeightSensitivity } from '../scoringFacade.js';

/**
 * One-step blend: alpha * today + (1 - alpha) * yesterday's raw published
 * score, rounded to integer. NOT a recursive EWMA — each day blends two raw
 * scores and carries no exponential memory of earlier days.
 */
export function blendWithYesterday(today, yesterday, alpha) {
  if (today == null) return null;
  if (yesterday == null) return today;
  if (typeof alpha !== 'number' || Number.isNaN(alpha)) alpha = 0.5;
  const a = Math.min(1, Math.max(0, alpha));
  return Math.round(a * today + (1 - a) * yesterday);
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

/**
 * Minimum non-null history points required before we trust a delta z-score.
 * Two-point std-dev was producing spurious "significant" flags on sparse
 * components — we now require a meaningful baseline. Configurable so the
 * threshold can be tuned without a code change.
 */
const DELTA_MIN_HISTORY = (() => {
  const raw = Number.parseInt(process.env.RESILIENCE_DELTA_MIN_HISTORY ?? '5', 10);
  return Number.isFinite(raw) && raw >= 2 ? raw : 5;
})();

/**
 * z-score of `today` against `history`. Returns null when fewer than the
 * configured minimum non-null history points are available or the series is
 * degenerate (zero variance). Null entries in `history` are filtered out.
 */
export function deltaSignificance(today, history) {
  if (today == null || !Array.isArray(history)) return null;
  const clean = history.filter((v) => v != null && Number.isFinite(v));
  if (clean.length < DELTA_MIN_HISTORY) return null;
  const sd = stddev(clean);
  if (sd === 0) return null;
  return (today - mean(clean)) / sd;
}

function computeDualBaselineExtras(c, componentId, scoreSmoothed, baseline, scopeId) {
  if (!isDualBaselineEnabled()) return null;

  const anchor = getPeaceTimeAnchor(scopeId, componentId);
  let delta_chronic = null;
  let z_score_chronic = null;
  let erosion_index = null;

  if (c.score != null && anchor != null) {
    delta_chronic = c.score - anchor;
    z_score_chronic = delta_chronic / 2;
  }
  if (c.score != null && anchor != null && scoreSmoothed != null) {
    erosion_index = Math.min(1, Math.max(0, (anchor - scoreSmoothed) / 10));
  }

  const lowDays = baseline.filter((v) => v != null && v < 4);
  return {
    delta_chronic,
    z_score_chronic: z_score_chronic == null ? null : Math.round(z_score_chronic * 100) / 100,
    erosion_index: erosion_index == null ? null : Math.round(erosion_index * 1000) / 1000,
    exhaustion_days: lowDays.length,
    cumulative_deficit: Math.round(lowDays.reduce((s, v) => s + (4 - v), 0) * 10) / 10,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isEwmaFreezeOnEpistemicEnabled(env = process.env) {
  return env.RESILIENCE_EWMA_FREEZE_ON_EPISTEMIC !== '0';
}

/**
 * Enrich the scoreComponents() result with `score_smoothed`, `delta_score`,
 * `delta_significance`, `delta_flag` for each component, using `history`
 * returned by loadHistoricalScores().
 *
 * Returns a NEW object (does not mutate the input).
 */
function enrichOneComponent(id, c, history, scopeId, freezeTemporal = false) {
  if (freezeTemporal) {
    return {
      ...c,
      score_smoothed: c.score,
      delta_score: null,
      delta_significance: null,
      delta_flag: null,
    };
  }

  const series = history[id] ?? [];
  const yesterday = series[0] ?? null;
  const baseline = series.slice(0, 14);
  const alpha = 0.3 + 0.5 * (c.certainty ?? 0);
  const score_smoothed = blendWithYesterday(c.score, yesterday, alpha);
  const delta_score = c.score != null && yesterday != null ? c.score - yesterday : null;
  const sig = deltaSignificance(c.score, baseline);
  const delta_flag = sig != null && Math.abs(sig) > 2 ? 'significant' : null;
  const dualBaseline = computeDualBaselineExtras(c, id, score_smoothed, baseline, scopeId);

  const enriched = {
    ...c,
    score_smoothed,
    delta_score,
    delta_significance: sig == null ? null : Math.round(sig * 100) / 100,
    delta_flag,
  };
  return dualBaseline ? { ...enriched, ...dualBaseline } : enriched;
}

export function enrichWithDeltaChannel(scoredComponents, history = {}, opts = {}) {
  const scopeId = opts.scopeId ?? 'national';
  const freezeTemporal = opts.freezeTemporal === true;
  const out = {};
  for (const [id, c] of Object.entries(scoredComponents)) {
    out[id] = enrichOneComponent(id, c, history, scopeId, freezeTemporal);
  }
  return out;
}

/**
 * Post-scoring epistemic enrichment: calibration deficit + shadow weight sensitivity.
 * @param {Record<string, object>} scoredComponents
 * @param {Array<object>} signalsForScoring
 * @param {object} scoreOpts options for scoreComponents (totalArticles, salienceContext, mediaSignals)
 * @param {object|null|undefined} validationMaturity summarizeValidationMaturity() output
 */
export function enrichScoredComponentsEpistemic(
  scoredComponents,
  signalsForScoring,
  scoreOpts,
  validationMaturity,
) {
  const calResult = enrichWithCalibrationPenalty(scoredComponents, validationMaturity);
  const wsResult = enrichWithWeightSensitivity(
    calResult.scored,
    signalsForScoring,
    scoreOpts,
    { validationMaturity },
  );
  return {
    scored: wsResult.scored,
    calibration: calResult.calibration,
    overall_score_calibrated: calResult.overall_score_calibrated,
    weight_sensitivity_summary: wsResult.weight_sensitivity_summary,
    weight_sensitivity_note: wsResult.weight_sensitivity_note,
  };
}
