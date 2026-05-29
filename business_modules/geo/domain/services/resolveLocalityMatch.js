import { diceBigramSimilarity } from './localityStringSimilarity.js';
import { transliterateLocalityKey } from './transliterationLookup.js';

export const FUZZY_MIN_SCORE = 0.88;
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
    .replaceAll(/\s+/g, ' ');
}

/**
 * Remove common punctuation and quotes for a second lookup pass.
 * @param {string} s
 * @returns {string}
 */
export function stripPunctuationForLookup(s) {
  return String(s ?? '')
    .replaceAll(/['"`׳״]/g, '')
    .replaceAll(/[.,;:!?()[\]{}]/g, ' ')
    .replaceAll(/\s+/g, ' ')
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
    index.set(normalizeLocalityLookupKey(row.canonicalKey.replaceAll('_', ' ')), row);
  }
  return index;
}

/**
 * @param {import('../value_objects/geoEnrichment.js').NorthLocalityRow[]} localities
 * @returns {Map<string, import('../value_objects/geoEnrichment.js').NorthLocalityRow[]>}
 */
export function buildFuzzyPrefixBuckets(localities) {
  /** @type {Map<string, import('../value_objects/geoEnrichment.js').NorthLocalityRow[]>} */
  const buckets = new Map();
  for (const row of localities) {
    const keys = new Set();
    for (const name of row.names ?? []) {
      const n = normalizeLocalityLookupKey(name);
      if (n) keys.add(n[0]);
    }
    const ck = normalizeLocalityLookupKey(row.canonicalKey.replaceAll('_', ' '));
    if (ck) keys.add(ck[0]);
    for (const ch of keys) {
      if (!buckets.has(ch)) buckets.set(ch, []);
      buckets.get(ch).push(row);
    }
  }
  return buckets;
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
  const translit = transliterateLocalityKey(rawName);
  if (translit) {
    const nt = normalizeLocalityLookupKey(translit);
    if (nt && index.has(nt)) {
      return { row: index.get(nt), matchMethod: 'exact', matchConfidence: 0.99 };
    }
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
 * @param {import('../value_objects/geoEnrichment.js').NorthLocalityRow[]} rows
 * @param {string} q
 * @returns {{ row: import('../value_objects/geoEnrichment.js').NorthLocalityRow, score: number }[]}
 */
function scoreRowsForFuzzy(rows, q) {
  /** @type {{ row: import('../value_objects/geoEnrichment.js').NorthLocalityRow, score: number }[]} */
  const scored = [];
  for (const row of rows) {
    let best = 0;
    for (const name of row.names ?? []) {
      const n = normalizeLocalityLookupKey(name);
      const sc = diceBigramSimilarity(q, n);
      if (sc > best) best = sc;
    }
    const ck = normalizeLocalityLookupKey(row.canonicalKey.replaceAll('_', ' '));
    best = Math.max(best, diceBigramSimilarity(q, ck));
    if (best >= FUZZY_MIN_SCORE) scored.push({ row, score: best });
  }
  return scored;
}

function buildFuzzyMatchResult(top, scored, topCandidates) {
  return {
    row: top.row,
    matchMethod: 'fuzzy',
    matchConfidence: Math.round(top.score * 1000) / 1000,
    candidateCount: scored.length,
    topCandidates,
  };
}

function fuzzyPoolFromPrefix(localities, q, prefixBuckets) {
  const prefChar = q[0];
  if (!prefixBuckets || !prefChar || !prefixBuckets.has(prefChar)) return localities;
  const bucket = prefixBuckets.get(prefChar);
  return bucket?.length ? bucket : localities;
}

function tryPreferSubregionMatch(scored, preferSubregionId, topCandidates) {
  const prefer = String(preferSubregionId ?? '').trim().toLowerCase();
  if (!prefer) return null;

  const inSub = scored.filter((s) => String(s.row.subregionId ?? '').toLowerCase() === prefer);
  if (inSub.length === 1) return buildFuzzyMatchResult(inSub[0], scored, topCandidates);

  if (inSub.length > 1) {
    const top = inSub[0];
    const second = inSub[1];
    if (!second || top.score - second.score >= FUZZY_AMBIGUITY_GAP) {
      return buildFuzzyMatchResult(top, scored, topCandidates);
    }
  }
  return null;
}

/**
 * @param {import('../value_objects/geoEnrichment.js').NorthLocalityRow[]} localities
 * @param {string} rawName
 * @param {{ preferSubregionId?: string, prefixBuckets?: Map<string, import('../value_objects/geoEnrichment.js').NorthLocalityRow[]> }} [opts]
 * @returns {{
 *   row: import('../value_objects/geoEnrichment.js').NorthLocalityRow,
 *   matchMethod: string,
 *   matchConfidence: number,
 *   candidateCount: number,
 *   topCandidates: { canonicalKey: string, score: number }[],
 * } | { kind: 'fuzzy_ambiguous', candidates: { canonicalKey: string, score: number }[] }}
 */
export function resolveByFuzzyBest(localities, rawName, opts = {}) {
  const q = normalizeLocalityLookupKey(rawName);
  if (!q) return { kind: 'fuzzy_ambiguous', candidates: [] };

  const pool = fuzzyPoolFromPrefix(localities, q, opts.prefixBuckets);
  let scored = scoreRowsForFuzzy(pool, q);
  if (scored.length === 0 && pool !== localities) {
    scored = scoreRowsForFuzzy(localities, q);
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: 'fuzzy_ambiguous', candidates: [] };

  const topCandidates = scored
    .slice(0, 5)
    .map((s) => ({ canonicalKey: s.row.canonicalKey, score: Math.round(s.score * 1000) / 1000 }));

  const preferred = tryPreferSubregionMatch(scored, opts.preferSubregionId, topCandidates);
  if (preferred) return preferred;

  const top = scored[0];
  const second = scored[1];
  if (second && top.score - second.score < FUZZY_AMBIGUITY_GAP) {
    return { kind: 'fuzzy_ambiguous', candidates: topCandidates };
  }
  return buildFuzzyMatchResult(top, scored, topCandidates);
}

/**
 * Pick best candidate in preferred subregion when geo returns ambiguous list.
 * @param {Array<{ canonicalKey: string, score: number }>} candidates
 * @param {Map<string, import('../value_objects/geoEnrichment.js').NorthLocalityRow>} byCanonicalKey
 * @param {string} preferSubregionId
 * @returns {import('../value_objects/geoEnrichment.js').NorthLocalityRow | null}
 */
export function pickCandidateInSubregion(candidates, byCanonicalKey, preferSubregionId) {
  const prefer = String(preferSubregionId ?? '').trim().toLowerCase();
  if (!prefer || !candidates?.length) return null;
  const inSub = candidates
    .map((c) => {
      const row = byCanonicalKey.get(c.canonicalKey);
      if (!row || String(row.subregionId ?? '').toLowerCase() !== prefer) return null;
      return { row, score: c.score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (inSub.length === 0) return null;
  if (inSub[0].score < FUZZY_MIN_SCORE) return null;
  if (inSub.length > 1 && inSub[0].score - inSub[1].score < FUZZY_AMBIGUITY_GAP) return null;
  return inSub[0].row;
}
