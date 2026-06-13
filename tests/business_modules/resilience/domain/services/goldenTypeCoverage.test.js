import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

import { SIGNAL_TYPES } from '../../../../../business_modules/resilience/domain/services/signalCatalog.js';
import {
  EXTRACTION_SNAPSHOT_PATH,
  TYPE_COVERAGE_SNAPSHOT_PATH,
} from '../../../../../analyst/tuning/goldenPaths.js';

function loadSignalTypesFromJsonl(path) {
  if (!existsSync(path)) return new Set();
  const types = new Set();
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    for (const s of row.predicted_signals ?? row.gold_signals ?? []) {
      if (s.signal_type) types.add(s.signal_type);
    }
  }
  return types;
}

describe('golden corpus type coverage', () => {
  it('covers at least 60 distinct signal types across golden + coverage fixtures', () => {
    const fromGolden = loadSignalTypesFromJsonl(EXTRACTION_SNAPSHOT_PATH);
    const fromCoverage = loadSignalTypesFromJsonl(TYPE_COVERAGE_SNAPSHOT_PATH);
    const all = new Set([...fromGolden, ...fromCoverage]);
    assert.ok(all.size >= 60, `expected >=60 types, got ${all.size}`);
    assert.ok(all.size >= SIGNAL_TYPES.length - 5,
      `coverage fixture should cover nearly full catalog (${all.size}/${SIGNAL_TYPES.length})`);
  });

  it('every catalog type appears in at least one fixture row', () => {
    const fromGolden = loadSignalTypesFromJsonl(EXTRACTION_SNAPSHOT_PATH);
    const fromCoverage = loadSignalTypesFromJsonl(TYPE_COVERAGE_SNAPSHOT_PATH);
    const all = new Set([...fromGolden, ...fromCoverage]);
    for (const t of SIGNAL_TYPES) {
      assert.ok(all.has(t), `catalog type ${t} missing from golden/coverage fixtures`);
    }
  });
});
