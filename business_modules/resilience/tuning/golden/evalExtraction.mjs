#!/usr/bin/env node
/**
 * Offline golden regression: validates extraction snapshot structure (no live LLM).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(__dirname, 'extraction-snapshot.jsonl');
const MIN_ROWS = Number(process.env.GOLDEN_MIN_ROWS ?? 10);
const MAX_F1_DROP = Number(process.env.GOLDEN_MAX_F1_DROP ?? 0.02);

function loadJsonl(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const rows = loadJsonl(SNAPSHOT);
if (rows.length < MIN_ROWS) {
  console.error(`golden:eval FAIL — snapshot has ${rows.length} rows (min ${MIN_ROWS})`);
  process.exit(1);
}

const byType = new Map();
for (const row of rows) {
  if (!row.id || !Array.isArray(row.predicted_signals)) {
    console.error('golden:eval FAIL — invalid row shape', row.id);
    process.exit(1);
  }
  for (const s of row.predicted_signals) {
    if (!s.signal_type) continue;
    byType.set(s.signal_type, (byType.get(s.signal_type) ?? 0) + 1);
  }
}

const coveragePath = join(__dirname, 'type-coverage-snapshot.jsonl');
let baselineTypes = null;
try {
  const coverageRows = loadJsonl(coveragePath);
  baselineTypes = new Set(coverageRows.map((r) => r.signal_type).filter(Boolean));
} catch {
  baselineTypes = null;
}

if (baselineTypes && baselineTypes.size > 0) {
  const missing = [...baselineTypes].filter((t) => !byType.has(t));
  const dropRatio = missing.length / baselineTypes.size;
  if (dropRatio > MAX_F1_DROP) {
    console.error(
      `golden:eval FAIL — signal type coverage dropped ${(dropRatio * 100).toFixed(1)}% (max ${MAX_F1_DROP * 100}%)`,
      missing.slice(0, 10),
    );
    process.exit(1);
  }
}

console.log(`golden:eval OK — ${rows.length} rows, ${byType.size} signal types`);
