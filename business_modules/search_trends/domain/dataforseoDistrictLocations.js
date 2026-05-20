/**
 * DataForSEO `location_name` values for Google Trends explore tasks (Israel).
 * @see https://docs.dataforseo.com/v3/keywords_data/google_trends/explore/live
 */

/** Google Trends geo (from our districts) → DataForSEO location_name */
export const DATAFORSEO_LOCATION_BY_GEO = Object.freeze({
  IL: 'Israel',
  'IL-Z': 'North District,Israel',
  'IL-D': 'South District,Israel',
  'IL-M': 'Central District,Israel',
  'IL-HA': 'Haifa District,Israel',
  /** Gush Dan — Google geo IL-TA (Tel Aviv District) */
  'IL-TA': 'Tel Aviv District,Israel',
  'IL-JM': 'Jerusalem District,Israel',
});

/**
 * @param {string} [geo]
 * @returns {string}
 */
export function resolveDataforseoLocationName(geo) {
  const key = String(geo ?? 'IL').trim();
  return DATAFORSEO_LOCATION_BY_GEO[key] ?? DATAFORSEO_LOCATION_BY_GEO.IL;
}
