import {
  
  
  
  normalizeIsraelDistrictLabelKey,
  israelDistrictLabelKey,
} from '@israel-districts';



/**
 * @param {(key: string) => string} t
 * @param {string} [labelKeyOrId]
 */
export function districtDisplayName(t, labelKeyOrId) {
  const key = String(labelKeyOrId ?? '').trim();
  if (!key) return t('district.national');
  if (key.startsWith('district.') || key.startsWith('trends.district.')) {
    return t(normalizeIsraelDistrictLabelKey(key));
  }
  return t(israelDistrictLabelKey(key));
}

export {ISRAEL_DISTRICT_FILTER_ORDER, ISRAEL_REGIONAL_DISTRICT_ORDER, normalizeIsraelDistrictId, normalizeIsraelDistrictLabelKey, israelDistrictLabelKey} from '@israel-districts';