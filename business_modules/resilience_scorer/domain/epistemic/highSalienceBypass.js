/**
 * Critical-signal salience — curated types that must surface when lone and verified.
 *
 * Pipeline position: assess — referenced by componentEvidence critical_flags and presenceGates auto-rules.
 *
 * Owns: CRITICAL_BYPASS_SIGNAL_TYPES set, salienceContextFromDataVoid helper.
 * Does NOT: evaluate presence gates or evidence bands (presenceGates.js, componentEvidence.js).
 *
 * Key collaborators: presenceGates.js, componentEvidence.js, groundingPolicy.js, thinEvidencePolicy.js.
 */

/**
 * Curated signal types where a lone verified report must not be suppressed.
 * Former mass-based bypass evaluator removed with the scoring engine (min-math).
 * @type {ReadonlySet<string>}
 */
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
 * Extract salience-relevant fields from a data-void object for critical-flag context.
 *
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
