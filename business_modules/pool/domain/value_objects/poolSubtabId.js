/** @typedef {'naftali' | 'education'} PoolSubtabId */

export const POOL_SUBTAB_IDS = /** @type {const} */ (['naftali', 'education']);

/**
 * @param {unknown} value
 * @returns {value is PoolSubtabId}
 */
export function isPoolSubtabId(value) {
  return typeof value === 'string' && POOL_SUBTAB_IDS.includes(/** @type {PoolSubtabId} */ (value));
}
