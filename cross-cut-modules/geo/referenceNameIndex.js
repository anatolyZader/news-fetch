import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { collectRawLocalitiesFromNorthReferenceDoc } from '../../business_modules/geo/domain/services/northReferenceDocShape.js';
import { normalizeLocalityLookupKey } from '../../business_modules/geo/domain/services/resolveLocalityMatch.js';

/** Macro terms — skip as longest-match candidates (aligned with geoService classifyNonLocalityTerm). */
const SKIP_NORMALIZED = new Set([
  'צפון',
  'הצפון',
  'north',
  'northern israel',
  'הגליל',
  'גליל',
  'upper galilee',
  'western galilee',
  'galilee',
  'גולן',
  'רמת הגולן',
  'golan',
  'golan heights',
]);

/**
 * @param {string} rootDir — repository root
 * @returns {{ entries: { normalized: string, display: string }[] }}
 */
export function buildReferenceNameIndex(rootDir) {
  const refPath = resolve(rootDir, 'business_modules', 'geo', 'data', 'north-reference.json');
  const doc = JSON.parse(readFileSync(refPath, 'utf8'));
  const rows = collectRawLocalitiesFromNorthReferenceDoc(doc);
  /** @type {Map<string, string>} */
  const byNorm = new Map();
  for (const row of rows) {
    const names = [
      ...(row.names ?? []),
      row.officialHebrewName,
      String(row.canonicalKey ?? '').replace(/_/g, ' '),
    ].filter(Boolean);
    for (const raw of names) {
      const display = String(raw).trim();
      const normalized = normalizeLocalityLookupKey(display);
      if (normalized.length < 3 || SKIP_NORMALIZED.has(normalized)) continue;
      if (!byNorm.has(normalized) || display.length > (byNorm.get(normalized)?.length ?? 0)) {
        byNorm.set(normalized, display);
      }
    }
  }
  const entries = [...byNorm.entries()]
    .map(([normalized, display]) => ({ normalized, display }))
    .sort((a, b) => b.normalized.length - a.normalized.length);
  return { entries };
}
