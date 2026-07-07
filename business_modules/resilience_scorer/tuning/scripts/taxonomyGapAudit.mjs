/**
 * Taxonomy gap audit: production signal frequency, golden coverage, zero-hit types.
 *
 * Usage:
 *   npm run taxonomy:gap-audit
 *   node business_modules/resilience_scorer/tuning/scripts/taxonomyGapAudit.mjs --days=30
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_VERSION,
  SIGNAL_CATALOG,
  SIGNAL_TYPES,
} from '../../domain/services/signalCatalog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SIGNALS_DIR = resolve(ROOT, 'signals');
const GOLDEN_SNAPSHOT = resolve(
  ROOT,
  'business_modules/resilience_scorer/tuning/golden/extraction-snapshot.jsonl',
);

const daysArg = process.argv.find((a) => a.startsWith('--days='));
const maxDays = daysArg ? Number.parseInt(daysArg.split('=')[1], 10) : 30;

function parseDateFromFilename(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function loadProductionSignals(maxDaysBack) {
  const counts = {};
  let total = 0;
  const files = existsSync(SIGNALS_DIR) ? readdirSync(SIGNALS_DIR).filter((f) => f.startsWith('signals-') && f.endsWith('.json')) : [];
  const dates = [...new Set(files.map(parseDateFromFilename).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const cutoff = dates.length > maxDaysBack ? dates[dates.length - maxDaysBack] : dates[0];

  for (const file of files) {
    const date = parseDateFromFilename(file);
    if (cutoff && date && date < cutoff) continue;
    try {
      const data = JSON.parse(readFileSync(join(SIGNALS_DIR, file), 'utf8'));
      const list = data.signals ?? data;
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        const t = s.signal_type ?? s.type;
        if (!t) continue;
        counts[t] = (counts[t] ?? 0) + 1;
        total += 1;
      }
    } catch {
      // skip malformed
    }
  }
  return { counts, total, fileCount: files.length, cutoff };
}

function loadGoldenCounts() {
  const counts = {};
  if (!existsSync(GOLDEN_SNAPSHOT)) return counts;
  for (const line of readFileSync(GOLDEN_SNAPSHOT, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    for (const s of row.predicted_signals ?? []) {
      counts[s.signal_type] = (counts[s.signal_type] ?? 0) + 1;
    }
  }
  return counts;
}

const prod = loadProductionSignals(maxDays);
const golden = loadGoldenCounts();
const prodSorted = Object.entries(prod.counts).sort((a, b) => b[1] - a[1]);
const goldenTypes = new Set(Object.keys(golden));
const zeroProd = SIGNAL_TYPES.filter((t) => !prod.counts[t])
  .sort((a, b) => a.localeCompare(b));
const zeroGolden = SIGNAL_TYPES.filter((t) => !golden[t]);
const withDisambiguation = SIGNAL_CATALOG.filter((e) => e.disambiguation || e.example_evidence?.length);

console.log(JSON.stringify({
  catalog_version: CATALOG_VERSION,
  catalog_type_count: SIGNAL_TYPES.length,
  disambiguation_rich_entries: withDisambiguation.length,
  production: {
    signal_files_scanned: prod.fileCount,
    date_cutoff: prod.cutoff,
    total_signals: prod.total,
    distinct_types: prodSorted.length,
    top_20: prodSorted.slice(0, 20),
    zero_hit_types: zeroProd.length,
    zero_hit_sample: zeroProd.slice(0, 25),
  },
  golden: {
    distinct_types: goldenTypes.size,
    zero_hit_types: zeroGolden.length,
    types_with_3plus: Object.values(golden).filter((c) => c >= 3).length,
  },
  gaps: {
    in_production_not_golden: prodSorted
      .filter(([t]) => !golden[t])
      .slice(0, 15)
      .map(([t, c]) => ({ type: t, prod_count: c })),
  },
}, null, 2));
