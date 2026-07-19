/**
 * Critical-signal salience — the curated signal types where a lone verified
 * report must surface as an operator-visible critical flag (see
 * componentEvidence.js `critical_flags.salient_single_signal` and the
 * unverified-critical grounding tier in groundingPolicy.js).
 *
 * The former mass-based bypass evaluator (dominant-share / floor-skip logic)
 * was removed with the scoring engine.
 */

/** Curated types where a lone verified report must not be suppressed. */
export const CRITICAL_BYPASS_SIGNAL_TYPES = new Set([
  'harm_to_population',
  'early_warning_system_failure',
  'non_compliance_exit_early',
  'non_compliance_ignore_guidelines',
  'plan_failed_during_event',
  'protective_infrastructure_absent',
  'risk_exposure_behavior',
  'unsafe_gathering',
  'near_miss_reported',
  'panic_behavior',
]);

/**
 * @param {object|null|undefined} dataVoid
 * @returns {{ dataVoidLevel?: string, digitalDarkness?: boolean }}
 */
export function salienceContextFromDataVoid(dataVoid) {
  if (!dataVoid || typeof dataVoid !== 'object') return {};
  return {
    dataVoidLevel: dataVoid.level,
    digitalDarkness: dataVoid.digital_darkness === true,
  };
}
