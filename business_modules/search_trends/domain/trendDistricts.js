/**
 * Google Trends geo districts for Israel (geo codes from Trends interest-by-region).
 * @see https://trends.google.com — sub-national interest uses these geo values.
 */

/** @typedef {{ id: string, geo: string, labelKey: string }} TrendDistrict */

/** @type {readonly TrendDistrict[]} */
export const TREND_DISTRICTS = Object.freeze([
  { id: 'national', geo: 'IL', labelKey: 'trends.district.national' },
  { id: 'north', geo: 'IL-Z', labelKey: 'trends.district.north' },
  { id: 'south', geo: 'IL-D', labelKey: 'trends.district.south' },
  { id: 'center', geo: 'IL-M', labelKey: 'trends.district.center' },
  { id: 'haifa', geo: 'IL-HA', labelKey: 'trends.district.haifa' },
  { id: 'tel_aviv', geo: 'IL-TA', labelKey: 'trends.district.telAviv' },
  { id: 'jerusalem', geo: 'IL-JM', labelKey: 'trends.district.jerusalem' },
]);

export const TREND_DISTRICT_IDS = new Set(TREND_DISTRICTS.map((d) => d.id));

/**
 * @param {string} [raw]
 * @returns {TrendDistrict}
 */
export function resolveTrendDistrict(raw) {
  const id = String(raw ?? 'national').trim().toLowerCase();
  const found = TREND_DISTRICTS.find((d) => d.id === id);
  return found ?? TREND_DISTRICTS[0];
}
