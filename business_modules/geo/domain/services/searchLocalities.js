import { normalizeLocalityLookupKey } from './resolveLocalityMatch.js';

function displayNameForRow(row) {
  return row.officialHebrewName
    || row.names?.[0]
    || String(row.canonicalKey ?? '').replaceAll('_', ' ');
}

function namesForRow(row, displayName) {
  return [
    displayName,
    ...(row.names ?? []),
    String(row.canonicalKey ?? '').replaceAll('_', ' '),
  ].filter(Boolean);
}

function scoreNameAgainstQuery(q, name) {
  const n = normalizeLocalityLookupKey(name);
  if (!n) return 0;
  if (!q) return 0.01;
  if (n === q) return 3;
  if (n.startsWith(q)) return 2 + q.length / Math.max(n.length, 1);
  if (n.includes(q)) return 1 + q.length / Math.max(n.length, 1);
  return 0;
}

function scoreLocalityRow(row, q) {
  const displayName = displayNameForRow(row);
  const names = namesForRow(row, displayName);
  let score = q ? 0 : 0.01;
  for (const name of names) {
    const nameScore = scoreNameAgainstQuery(q, name);
    if (!q) {
      score = nameScore;
      break;
    }
    score = Math.max(score, nameScore);
  }
  if (score <= 0) return null;
  return {
    canonicalKey: row.canonicalKey,
    displayName,
    subregionId: row.subregionId ?? '',
    score,
  };
}

/**
 * Search north-reference localities for structured picker / autocomplete.
 * @param {import('../value_objects/geoEnrichment.js').NorthLocalityRow[]} localities
 * @param {string} [query]
 * @param {{ limit?: number, scope?: string }} [opts]
 * @returns {{ canonicalKey: string, displayName: string, subregionId: string }[]}
 */
export function searchLocalities(localities, query = '', opts = {}) {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const q = normalizeLocalityLookupKey(query);
  /** @type {{ canonicalKey: string, displayName: string, subregionId: string, score: number }[]} */
  const scored = [];

  for (const row of localities ?? []) {
    const entry = scoreLocalityRow(row, q);
    if (entry) scored.push(entry);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.displayName.localeCompare(b.displayName, 'he');
  });

  return scored.slice(0, limit).map(({ canonicalKey, displayName, subregionId }) => ({
    canonicalKey,
    displayName,
    subregionId,
  }));
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isGeoExactOnlyEnabled(env = process.env) {
  return env.RESILIENCE_GEO_EXACT_ONLY === '1';
}
