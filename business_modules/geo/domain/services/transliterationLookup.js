import { normalizeLocalityLookupKey } from './resolveLocalityMatch.js';

/** Latin / variant spellings → Hebrew lookup key for exact-stage resolution. */
const VARIANT_TO_HEBREW = {
  'kiryat shmona': 'קריית שמונה',
  'kiryat shemona': 'קריית שמונה',
  'qiryat shemona': 'קריית שמונה',
  'kiryat shemona': 'קריית שמונה',
  'tzfat': 'צפת',
  'safed': 'צפת',
  'tiberias': 'טבריה',
  'akko': 'עכו',
  'acre': 'עכו',
  'nahariya': 'נהריה',
  'metula': 'מטולה',
  'karmiel': 'כרמיאל',
  'katzrin': 'קצרין',
  'nazareth': 'נצרת',
  'nazereth': 'נצרת',
  'afula': 'עפולה',
  'yokneam': 'יוקנעם',
  'majdal shams': 'מגדל שמס',
};

/**
 * @param {string} rawName
 * @returns {string|null} Hebrew (or canonical) form to try in exact index, or null
 */
export function transliterateLocalityKey(rawName) {
  const key = normalizeLocalityLookupKey(rawName);
  if (!key) return null;
  return VARIANT_TO_HEBREW[key] ?? null;
}
