/**
 * Northern PBO sub-regions (same ids as REGIONAL_PBO_REGION_IDS in pbo_report_regional).
 * Kept in geo module to avoid business-module cross-imports; parity is tested in tests/business_modules/geo.
 */
export const NORTH_SUBREGION_IDS = ['naftali', 'golan', 'baram', 'hiram', 'galma'];

export const NORTH_SUBREGION_ID_SET = new Set(NORTH_SUBREGION_IDS);

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isNorthSubregionId(id) {
  return typeof id === 'string' && NORTH_SUBREGION_ID_SET.has(id.trim().toLowerCase());
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isGolanSubregionId(id) {
  return String(id ?? '').trim().toLowerCase() === 'golan';
}
