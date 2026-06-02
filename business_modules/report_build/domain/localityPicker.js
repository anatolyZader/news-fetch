import { normalizeLocalityLookupKey } from '../../geo/domain/services/resolveLocalityMatch.js';

/**
 * @param {{ canonicalKey: string, displayName: string }[]} localities
 * @returns {string}
 */
export function buildLocalityPickerMessage(localities) {
  const lines = ['בחר יישוב (הקלד מספר או שם מדויק):'];
  for (let i = 0; i < localities.length; i += 1) {
    lines.push(`${i + 1}. ${localities[i].displayName}`);
  }
  return lines.join('\n');
}

/**
 * @param {string} text
 * @param {{ canonicalKey: string, displayName: string }[]} localities
 * @returns {{ canonicalKey: string, displayName: string } | null}
 */
export function parseLocalityPickerReply(text, localities) {
  const t = String(text ?? '').trim();
  if (!t || !localities?.length) return null;

  const num = Number.parseInt(t, 10);
  if (Number.isInteger(num) && num >= 1 && num <= localities.length) {
    return localities[num - 1];
  }

  const key = normalizeLocalityLookupKey(t);
  for (const loc of localities) {
    if (normalizeLocalityLookupKey(loc.displayName) === key) return loc;
    if (normalizeLocalityLookupKey(loc.canonicalKey.replaceAll('_', ' ')) === key) return loc;
    if (normalizeLocalityLookupKey(loc.canonicalKey) === key) return loc;
  }
  return null;
}

/**
 * @param {object} structured
 * @returns {boolean}
 */
export function needsStructuredLocality(structured) {
  const obs = structured?.observation;
  if (!obs || typeof obs !== 'object') return true;
  if (typeof obs.localityKey === 'string' && obs.localityKey.trim()) return false;
  return true;
}
