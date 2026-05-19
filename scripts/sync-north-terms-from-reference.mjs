#!/usr/bin/env node
/**
 * List locality name candidates from north-reference.json not yet in NORTH_TERMS.
 *
 *   node scripts/sync-north-terms-from-reference.mjs
 *   node scripts/sync-north-terms-from-reference.mjs --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectRawLocalitiesFromNorthReferenceDoc } from '../business_modules/geo/domain/services/northReferenceDocShape.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const refPath = resolve(root, 'business_modules/geo/data/north-reference.json');
const filterPath = resolve(root, 'business_modules/resilience/domain/services/regionSignalFilter.js');

const GENERIC = new Set([
  'north', 'northern', 'northern israel', 'galilee', 'upper galilee', 'western galilee',
  'golan', 'golan heights', 'haifa', 'acre', 'akko', 'nahariya', 'kiryat shmona',
  'kiryat shemona', 'metula', 'shlomi', 'safed', 'tzfat', 'tiberias', 'karmiel',
  'katzrin', 'tamra', 'majdal shams', 'hula', 'jezreel', 'yokneam', 'afula',
  'beit shean', 'nazareth', 'nazereth', 'migdal', 'hurfeish', 'deir hanna',
  'abu snan', 'julis', 'yirka', 'kfar kama', 'kfar manda', 'majdal al-krum',
  'jadeidi-makr', 'i\'billin', 'ibillin',
  'צפון', 'צפוני', 'צפונית', 'צפונ', 'גליל', 'הגליל', 'גליל עליון', 'גליל מערבי',
  'גולן', 'רמת הגולן', 'חיפה', 'עכו', 'נהריה', 'קריית שמונה', 'קרית שמונה',
  'מטולה', 'שלומי', 'צפת', 'טבריה', 'כרמיאל', 'קצרין', 'טמרה', 'מגדל שמס',
  'עמק החולה', 'עמק יזרעאל', 'יוקנעם', 'עפולה', 'בית שאן', 'נצרת', 'חורפיש',
  'דיר חנא', 'אבו סנאן', 'ירכא', 'כפר כמא', 'כפר מנדא', 'אעבלין',
]);

function loadExistingTerms() {
  const src = readFileSync(filterPath, 'utf8');
  const m = src.match(/const NORTH_TERMS = \[([\s\S]*?)\];/);
  if (!m) throw new Error('NORTH_TERMS array not found');
  const terms = [];
  const re = /'((?:\\.|[^'\\])*)'/g;
  let match;
  while ((match = re.exec(m[1])) !== null) {
    terms.push(match[1].replace(/\\'/g, "'"));
  }
  return new Set(terms);
}

function collectCandidates() {
  const doc = JSON.parse(readFileSync(refPath, 'utf8'));
  const rows = collectRawLocalitiesFromNorthReferenceDoc(doc);
  const out = new Set();
  for (const row of rows) {
    const names = [
      ...(row.names ?? []),
      ...(row.aliases ?? []),
      row.officialHebrewName,
    ].filter(Boolean);
    for (const raw of names) {
      const s = String(raw).trim();
      if (s.length < 3) continue;
      const low = s.toLowerCase();
      if (GENERIC.has(low) || GENERIC.has(s)) continue;
      if (/^[a-z0-9\s'.-]+$/i.test(s)) out.add(low);
      else out.add(s);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'he'));
}

const existing = loadExistingTerms();
const candidates = collectCandidates().filter((t) => !existing.has(t));

if (process.argv.includes('--write') && candidates.length > 0) {
  let src = readFileSync(filterPath, 'utf8');
  const insert = candidates.map((t) => `  '${t.replace(/'/g, "\\'")}',`).join('\n');
  const marker = '  // From north-reference.json (sync-north-terms-from-reference.mjs)';
  if (src.includes(marker)) {
    src = src.replace(
      /(\n];)\s*\n\nfunction haystackForSignal/,
      `\n${insert}\n$1\n\nfunction haystackForSignal`,
    );
  } else {
    src = src.replace(
      /(\s+'אעבלין',\n)(\];)/,
      `$1\n${marker}\n${insert}\n$2`,
    );
  }
  writeFileSync(filterPath, src);
  console.error(`Wrote ${candidates.length} new terms to regionSignalFilter.js`);
} else {
  console.log(JSON.stringify({ new_count: candidates.length, candidates }, null, 2));
}
