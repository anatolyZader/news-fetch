/**
 * Canonical Israel home-front districts for UI, APIs, and search trends.
 * Regional ids: north, south, jerusalem, haifa, center, dan (+ national aggregate).
 */

export const ISRAEL_NATIONAL_DISTRICT_ID = 'national';

/** @type {Readonly<Record<string, string>>} */
export const ISRAEL_DISTRICT_LEGACY_ALIASES = Object.freeze({
  tel_aviv: 'dan',
});

/** Sub-national districts in display order */
export const ISRAEL_REGIONAL_DISTRICT_ORDER = Object.freeze([
  'north',
  'south',
  'jerusalem',
  'haifa',
  'center',
  'dan',
]);

/** Filter / API order including national */
export const ISRAEL_DISTRICT_FILTER_ORDER = Object.freeze([
  ISRAEL_NATIONAL_DISTRICT_ID,
  ...ISRAEL_REGIONAL_DISTRICT_ORDER,
]);

export const ISRAEL_DISTRICT_IDS = new Set(ISRAEL_DISTRICT_FILTER_ORDER);

/** @type {Readonly<Record<string, string>>} */
const LEGACY_LABEL_KEYS = Object.freeze({
  'trends.district.telAviv': 'district.dan',
});

/**
 * @param {string} [raw]
 * @returns {string}
 */
export function normalizeIsraelDistrictId(raw) {
  const normalized = String(raw ?? ISRAEL_NATIONAL_DISTRICT_ID).trim().toLowerCase();
  return ISRAEL_DISTRICT_LEGACY_ALIASES[normalized] ?? normalized;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function israelDistrictLabelKey(id) {
  return `district.${normalizeIsraelDistrictId(id)}`;
}

/**
 * @param {string} [labelKey]
 * @returns {string}
 */
export function normalizeIsraelDistrictLabelKey(labelKey) {
  const key = String(labelKey ?? '').trim();
  if (!key) return israelDistrictLabelKey(ISRAEL_NATIONAL_DISTRICT_ID);
  if (LEGACY_LABEL_KEYS[key]) return LEGACY_LABEL_KEYS[key];
  if (key.startsWith('trends.district.')) {
    const suffix = key.slice('trends.district.'.length);
    if (suffix === 'telAviv') return 'district.dan';
    return `district.${suffix}`;
  }
  return key;
}

/**
 * @returns {Array<{ id: string, labelKey: string }>}
 */
export function listIsraelDistrictsForApi() {
  return ISRAEL_DISTRICT_FILTER_ORDER.map((id) => ({
    id,
    labelKey: israelDistrictLabelKey(id),
  }));
}

/**
 * Normalize district ids / label keys on API payloads (cached or live).
 * @param {object} payload
 * @returns {object}
 */
export function normalizeIsraelDistrictRefs(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const district = payload.district;
  const next = { ...payload };

  if (district && typeof district === 'object') {
    next.district = {
      ...district,
      id: normalizeIsraelDistrictId(district.id),
      labelKey: normalizeIsraelDistrictLabelKey(district.labelKey),
    };
  }

  if (Array.isArray(payload.regionBreakdown)) {
    next.regionBreakdown = payload.regionBreakdown.map((row) => ({
      ...row,
      districtId: normalizeIsraelDistrictId(row.districtId),
      labelKey: normalizeIsraelDistrictLabelKey(row.labelKey),
    }));
  }

  const comparison = payload.analytics?.districtComparison;
  if (comparison && typeof comparison === 'object') {
    const mapRow = (row) =>
      row && typeof row === 'object'
        ? {
            ...row,
            districtId: row.districtId == null ? row.districtId : normalizeIsraelDistrictId(row.districtId),
            labelKey: row.labelKey == null ? row.labelKey : normalizeIsraelDistrictLabelKey(row.labelKey),
          }
        : row;
    next.analytics = {
      ...payload.analytics,
      districtComparison: {
        ...comparison,
        leaders: (comparison.leaders ?? []).map(mapRow),
        laggards: (comparison.laggards ?? []).map(mapRow),
      },
    };
  }

  return next;
}
