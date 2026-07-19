/**
 * Calibration trust / deficit — shrinks headline scores toward neutral (5.5)
 * until validation maturity (Tier 3–5) supports author-set heuristics.
 */

import { overallScore } from './overallScore.js';
// Trust math source of truth lives in domain/epistemic (importable from both
// sides of the analyst quarantine — domain must not import analyst/).
export {
  computeCalibrationTrust,
  buildCalibrationMethodology,
} from '../domain/epistemic/calibrationMethodology.js';
import {
  computeCalibrationTrust,
  buildCalibrationMethodology,
} from '../domain/epistemic/calibrationMethodology.js';

const SCORE_NEUTRAL = 5.5;

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
