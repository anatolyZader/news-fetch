/**
 * Calibration methodology metadata (operator audit — mirrors analyst trust math).
 */

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
