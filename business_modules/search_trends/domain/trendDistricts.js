/**
 * Google Trends geo districts for Israel (geo codes from Trends interest-by-region).
 * @see https://trends.google.com — sub-national interest uses these geo values.
 */

import {
  ISRAEL_DISTRICT_FILTER_ORDER,
  ISRAEL_DISTRICT_IDS,
  normalizeIsraelDistrictId,
  israelDistrictLabelKey,
} from '../../../cross-cut-modules/geo/israelDistricts.js';

/** @typedef {{ id: string, geo: string, labelKey: string }} TrendDistrict */

/** @type {Readonly<Record<string, string>>} */
const GEO_BY_DISTRICT_ID = Object.freeze({
  national: 'IL',
  north: 'IL-Z',
  south: 'IL-D',
  jerusalem: 'IL-JM',
  haifa: 'IL-HA',
  center: 'IL-M',
  dan: 'IL-TA',
});

/** @type {readonly TrendDistrict[]} */
export const TREND_DISTRICTS = Object.freeze(
  ISRAEL_DISTRICT_FILTER_ORDER.map((id) => ({
    id,
    geo: GEO_BY_DISTRICT_ID[id],
    labelKey: israelDistrictLabelKey(id),
  })),
);

export const TREND_DISTRICT_FILTER_ORDER = ISRAEL_DISTRICT_FILTER_ORDER;
export const TREND_DISTRICT_IDS = ISRAEL_DISTRICT_IDS;

/**
 * @param {string} [raw]
 * @returns {TrendDistrict}
 */
export function resolveTrendDistrict(raw) {
  const id = normalizeIsraelDistrictId(raw);
  const found = TREND_DISTRICTS.find((d) => d.id === id);
  return found ?? TREND_DISTRICTS[0];
}
