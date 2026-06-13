/**
 * Calibration trust / deficit — shrinks headline scores toward neutral (5.5)
 * until validation maturity (Tier 3–5) supports author-set heuristics.
 */

import { overallScore } from './overallScore.js';

const SCORE_NEUTRAL = 5.5;
const DEFAULT_TIER3_MIN = 30;

/**
 * @param {object|null|undefined} maturity summarizeValidationMaturity() output
 * @param {{ weightsStatus?: string, tier3Min?: number }} [opts]
 * @returns {number} 0..1
 */
export function computeCalibrationTrust(maturity, opts = {}) {
  const recordCount = maturity?.collection?.record_count ?? 0;
  const tier3Min = opts.tier3Min ?? DEFAULT_TIER3_MIN;
  const historyFactor = Math.min(1, recordCount / tier3Min);

  const labelRate = maturity?.tier_readiness?.tier4_construct?.expert_label_fill_rate ?? 0;
  const labelFactor = Math.min(1, labelRate / 100);

  const weightsStatus = opts.weightsStatus ?? 'author_set';
  const weightsFactor = weightsStatus === 'fitted' ? 1 : 0.4;

  const trust = 0.5 * historyFactor + 0.3 * labelFactor + 0.2 * weightsFactor;
  return Math.min(1, Math.max(0, Math.round(trust * 1000) / 1000));
}

/**
 * @param {number|null|undefined} score
 * @param {number} trust 0..1
 * @param {number} [neutral]
 * @returns {number|null}
 */
export function shrinkScoreToNeutral(score, trust, neutral = SCORE_NEUTRAL) {
  if (score == null || !Number.isFinite(score)) return null;
  const t = Math.min(1, Math.max(0, trust));
  const calibrated = neutral + t * (score - neutral);
  return Math.max(1, Math.min(10, Math.round(calibrated)));
}

/**
 * Build assessment-level calibration metadata for methodology block.
 * @param {object|null|undefined} maturity
 * @param {{ weightsStatus?: string, tier3Min?: number }} [opts]
 */
export function buildCalibrationMethodology(maturity, opts = {}) {
  const trust = computeCalibrationTrust(maturity, opts);
  const recordCount = maturity?.collection?.record_count ?? 0;
  const tier3Min = opts.tier3Min ?? DEFAULT_TIER3_MIN;
  const tier3Ready = maturity?.tier_readiness?.tier3_tuning?.status
    === 'enough_records_run_suggest_tuning'
    || recordCount >= tier3Min;

  return {
    trust,
    deficit: Math.round((1 - trust) * 1000) / 1000,
    tier3_ready: tier3Ready,
    record_count: recordCount,
    tier3_min_reports: tier3Min,
    note:
      'Headline scores are author-set heuristics; score_calibrated shrinks toward 5.5 until Tier 3–5 maturity.',
  };
}

/**
 * @param {Record<string, object>} scoredComponents
 * @param {object|null|undefined} maturity
 * @param {{ weightsStatus?: string, tier3Min?: number }} [opts]
 * @returns {{ scored: Record<string, object>, calibration: object, overall_score_calibrated: number|null }}
 */
export function enrichWithCalibrationPenalty(scoredComponents, maturity, opts = {}) {
  const trust = computeCalibrationTrust(maturity, opts);
  const deficit = Math.round((1 - trust) * 1000) / 1000;
  const calibration = buildCalibrationMethodology(maturity, opts);

  const scored = {};
  for (const [id, c] of Object.entries(scoredComponents ?? {})) {
    if (c?.score == null) {
      scored[id] = {
        ...c,
        calibration_trust: trust,
        calibration_deficit: deficit,
        score_calibrated: null,
      };
      continue;
    }
    scored[id] = {
      ...c,
      calibration_trust: trust,
      calibration_deficit: deficit,
      score_calibrated: shrinkScoreToNeutral(c.score, trust),
    };
  }

  const overall_score_calibrated = overallScore(
    Object.fromEntries(
      Object.entries(scored).map(([id, c]) => [id, {
        score: c.score_calibrated,
        certainty: c.certainty ?? 0,
      }]),
    ),
  );

  return { scored, calibration, overall_score_calibrated };
}
