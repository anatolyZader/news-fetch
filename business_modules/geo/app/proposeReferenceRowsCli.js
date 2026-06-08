#!/usr/bin/env node
/**
 * Aggregate unknown locality review queue into proposed north-reference rows (human review only).
 *
 *   node business_modules/geo/input/proposeReferenceRowsFromUnknownQueue.js
 *   node business_modules/geo/input/proposeReferenceRowsFromUnknownQueue.js --jsonl business_modules/geo/data/review/unknown-localities.jsonl
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeLocalityLookupKey } from '../index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const jsonlArg = process.argv.includes('--jsonl')
  ? process.argv[process.argv.indexOf('--jsonl') + 1]
  : resolve(root, 'business_modules/geo/data/review/unknown-localities.jsonl');

/** @type {Map<string, { raw: string, count: number, reasons: Set<string>, candidates: object[] }>} */
const agg = new Map();

if (existsSync(jsonlArg)) {
  const lines = readFileSync(jsonlArg, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      const raw = row.raw_name ?? row.rawName ?? '';
      const key = normalizeLocalityLookupKey(raw);
      if (!key) continue;
      const cur = agg.get(key) ?? { raw: String(raw).trim(), count: 0, reasons: new Set(), candidates: [] };
      cur.count += 1;
      if (row.reason) cur.reasons.add(String(row.reason));
      if (Array.isArray(row.candidates)) {
        for (const c of row.candidates) {
          if (!cur.candidates.some((x) => x.canonicalKey === c.canonicalKey)) cur.candidates.push(c);
        }
      }
      agg.set(key, cur);
    } catch {
      /* skip bad line */
    }
  }
}

const proposals = [...agg.values()]
  .sort((a, b) => b.count - a.count)
  .map((e) => ({
    suggested_names: [e.raw],
    occurrence_count: e.count,
    reasons: [...e.reasons],
    top_candidates: e.candidates.slice(0, 5),
    note: 'Merge manually into north-reference.json; bump version when editing.',
  }));

console.log(JSON.stringify({ source: jsonlArg, proposal_count: proposals.length, proposals }, null, 2));
