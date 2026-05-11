import { diceBigramSimilarity } from './localityStringSimilarity.js';

const FUZZY_MIN_SCORE = 0.88;
const FUZZY_AMBIGUITY_GAP = 0.02;

/**
 * @param {string} s
 * @returns {string}
 */
export function normalizeLocalityLookupKey(s) {
  return String(s ?? '')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Remove common punctuation and quotes for a second lookup pass.
 * @param {string} s
 * @returns {string}
 */
export function stripPunctuationForLookup(s) {
  return String(s ?? '')
    .replace(/['"`׳״]/g, '')
    .replace(/[.,;:!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @type {Record<string, string>} */
const HEBREW_FINAL_FORMS = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

/**
 * Map common Hebrew final-letter forms to non-final for matching free text.
 * @param {string} s
 * @returns {string}
 */
export function normalizeHebrewFinalLetters(s) {
  let out = '';
  for (const ch of s) {
    out += HEBREW_FINAL_FORMS[ch] ?? ch;
  }
  return out;
}

/**
 * @param {import('../value_objects/geoEnrichment.js').NorthLocalityRow[]} localities
 * @returns {Map<string, import('../value_objects/geoEnrichment.js').NorthLocalityRow>}
 */
export function buildLookupIndex(localities) {
  const index = new Map();
  for (const row of localities) {
    for (const name of row.names ?? []) {
      index.set(normalizeLocalityLookupKey(name), row);
    }
    index.set(normalizeLocalityLookupKey(row.canonicalKey.replace(/_/g, ' ')), row);
  }
  return index;
}

/**
 * @param {Map<string, import('../value_objects/geoEnrichment.js').NorthLocalityRow>} index
 * @param {string} rawName
 * @returns {{ row: import('../value_objects/geoEnrichment.js').NorthLocalityRow, matchMethod: string, matchConfidence: number } | null}
 */
export function resolveByExactStages(index, rawName) {
  const n0 = normalizeLocalityLookupKey(rawName);
  if (n0 && index.has(n0)) {
    return { row: index.get(n0), matchMethod: 'exact', matchConfidence: 1 };
  }
  const n1 = normalizeLocalityLookupKey(stripPunctuationForLookup(rawName));
  if (n1 && n1 !== n0 && index.has(n1)) {
    return { row: index.get(n1), matchMethod: 'punctuation', matchConfidence: 1 };
  }
  const n2 = normalizeLocalityLookupKey(normalizeHebrewFinalLetters(n0));
  if (n2 && n2 !== n0 && index.has(n2)) {
    return { row: index.get(n2), matchMethod: 'hebrew_final', matchConfidence: 0.99 };
  }
  const n3 = normalizeLocalityLookupKey(normalizeHebrewFinalLetters(stripPunctuationForLookup(rawName)));
  if (n3 && !index.has(n0) && !index.has(n1) && index.has(n3)) {
    return { row: index.get(n3), matchMethod: 'hebrew_final', matchConfidence: 0.98 };
  }
  return null;
}

/**
 * @param {import('../value_objects/geoEnrichment.js').NorthLocalityRow[]} localities
 * @param {string} rawName
 * @returns {{ row: import('../value_objects/geoEnrichment.js').NorthLocalityRow, matchMethod: string, matchConfidence: number, candidateCount: number } | { kind: 'fuzzy_ambiguous', candidates: { canonicalKey: string, score: number }[] }}
 */
export function resolveByFuzzyBest(localities, rawName) {
  const q = normalizeLocalityLookupKey(rawName);
  if (!q) return { kind: 'fuzzy_ambiguous', candidates: [] };

  /** @type {{ row: import('../value_objects/geoEnrichment.js').NorthLocalityRow, score: number }[]} */
  const scored = [];
  for (const row of localities) {
    let best = 0;
    for (const name of row.names ?? []) {
      const n = normalizeLocalityLookupKey(name);
      const sc = diceBigramSimilarity(q, n);
      if (sc > best) best = sc;
    }
    const ck = normalizeLocalityLookupKey(row.canonicalKey.replace(/_/g, ' '));
    best = Math.max(best, diceBigramSimilarity(q, ck));
    if (best >= FUZZY_MIN_SCORE) scored.push({ row, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: 'fuzzy_ambiguous', candidates: [] };
  const top = scored[0];
  const second = scored[1];
  if (second && top.score - second.score < FUZZY_AMBIGUITY_GAP) {
    return {
      kind: 'fuzzy_ambiguous',
      candidates: scored.slice(0, 5).map((s) => ({ canonicalKey: s.row.canonicalKey, score: Math.round(s.score * 1000) / 1000 })),
    };
  }
  return {
    row: top.row,
    matchMethod: 'fuzzy',
    matchConfidence: Math.round(top.score * 1000) / 1000,
    candidateCount: scored.length,
  };
}
