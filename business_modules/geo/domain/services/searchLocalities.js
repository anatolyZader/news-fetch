import { normalizeLocalityLookupKey } from './resolveLocalityMatch.js';

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
    const displayName = row.officialHebrewName
      || row.names?.[0]
      || String(row.canonicalKey ?? '').replaceAll('_', ' ');
    const names = [
      displayName,
      ...(row.names ?? []),
      String(row.canonicalKey ?? '').replaceAll('_', ' '),
    ].filter(Boolean);

    let score = q ? 0 : 0.01;
    for (const name of names) {
      const n = normalizeLocalityLookupKey(name);
      if (!n) continue;
      if (!q) {
        score = 0.01;
        break;
      }
      if (n === q) score = Math.max(score, 3);
      else if (n.startsWith(q)) score = Math.max(score, 2 + q.length / Math.max(n.length, 1));
      else if (n.includes(q)) score = Math.max(score, 1 + q.length / Math.max(n.length, 1));
    }
    if (score > 0) {
      scored.push({
        canonicalKey: row.canonicalKey,
        displayName,
        subregionId: row.subregionId ?? '',
        score,
      });
    }
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
