/**
 * Soft data-void reasons — warning-level drops that should not trigger critical UX stacks.
 */

export const SOFT_VOID_REASONS = new Set([
  'digital_z_drop',
  'digital_volume_drop',
  'probe_unconfirmed',
]);

/**
 * @param {object|null|undefined} dataVoid
 * @returns {boolean}
 */
export function isSoftVoidWarning(dataVoid) {
  return dataVoid?.level === 'warning' && SOFT_VOID_REASONS.has(dataVoid?.reason);
}
