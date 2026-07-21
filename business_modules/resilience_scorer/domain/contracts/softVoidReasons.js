/**
 * Soft data-void reason codes treated as warning-level (non-critical UX).
 *
 * Pipeline position: assess/report path — distinguishes benign sampling gaps from
 * hard failures in data-void handling. Client-safe isomorphic.
 *
 * Owns: SOFT_VOID_REASONS set and isSoftVoidWarning classifier.
 * Does NOT: probe execution, quarantine policy, or narrative generation.
 *
 * Key collaborators: epistemic profile builders, reportRoutes.js, data-void UX.
 */

/** Warning-level void reasons that should not trigger critical alert stacks. */
export const SOFT_VOID_REASONS = new Set([
  'digital_z_drop',
  'digital_volume_drop',
  'probe_unconfirmed',
]);

/**
 * Return true when a data_void object is a soft warning (not a hard failure).
 * @param {object|null|undefined} dataVoid
 * @returns {boolean}
 */
export function isSoftVoidWarning(dataVoid) {
  return dataVoid?.level === 'warning' && SOFT_VOID_REASONS.has(dataVoid?.reason);
}
