import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  precisionRecallF1,
  cohensKappa,
} from '../../../business_modules/resilience_scorer/analyst/tuning/domain/extractionMetrics.js';
import {
  BUILD_CORPUS_SCRIPT,
  CORPUS_PATH,
  EXTRACTION_SNAPSHOT_PATH,
} from '../../../business_modules/resilience_scorer/analyst/tuning/goldenPaths.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '../../..');

const F1_THRESHOLD = 0.55;
const MACRO_KAPPA_THRESHOLD = 0.4;
const MIN_CORPUS_SIZE = 20;

function maybeRefreshGoldenCorpus() {
  if (process.env.RESILIENCE_REFRESH_GOLDEN !== '1') return;
  const r = spawnSync(process.execPath, [BUILD_CORPUS_SCRIPT], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `buildCorpus.mjs failed with exit ${r.status}`);
}

function loadJsonl(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

describe('Golden corpus regression (N1)', () => {
  maybeRefreshGoldenCorpus();
  const corpus   = loadJsonl(CORPUS_PATH);
  const snapshot = loadJsonl(EXTRACTION_SNAPSHOT_PATH);

  if (!corpus || corpus.length === 0) {
    it.skip('corpus.jsonl missing or empty — run npm run golden:build-corpus', () => {});
    return;
  }
  if (!snapshot || snapshot.length === 0) {
    it.skip('extraction-snapshot.jsonl missing or empty — run npm run golden:build-corpus', () => {});
    return;
  }

  const snapshotById = new Map(snapshot.map((s) => [s.id, s]));
  const pairs = corpus.map((rec) => ({
    gold:      rec.gold_signals ?? [],
    predicted: snapshotById.get(rec.id)?.predicted_signals ?? [],
  }));

  it('every corpus record has a snapshot entry (no missing predictions)', () => {
    for (const rec of corpus) {
      assert.ok(snapshotById.has(rec.id),
        `corpus record ${rec.id} has no predicted_signals snapshot — re-run npm run golden:build-corpus`);
    }
  });

  it('precision/recall/F1 meet baseline thresholds (or corpus is too small to enforce)', () => {
    const result = precisionRecallF1(pairs);
    if (corpus.length < MIN_CORPUS_SIZE) {
      console.warn(`[golden-corpus] corpus has ${corpus.length} records (<${MIN_CORPUS_SIZE}); thresholds NOT enforced.`);
      return;
    }
    assert.ok(result.micro.f1 >= F1_THRESHOLD,
      `micro-F1 ${result.micro.f1} < threshold ${F1_THRESHOLD} (P=${result.micro.precision}, R=${result.micro.recall}, TP=${result.micro.tp}, FP=${result.micro.fp}, FN=${result.micro.fn})`);
  });

  it('macro Cohen kappa meets baseline threshold (or corpus too small)', () => {
    if (corpus.length < MIN_CORPUS_SIZE) return;
    const observedTypes = new Set();
    for (const p of pairs) {
      for (const g of p.gold) observedTypes.add(g.signal_type);
      for (const pp of p.predicted) observedTypes.add(pp.signal_type);
    }
    const kappa = cohensKappa(pairs, { signalTypes: [...observedTypes] });
    assert.ok(kappa.macro_kappa >= MACRO_KAPPA_THRESHOLD,
      `macro Cohen κ ${kappa.macro_kappa} < threshold ${MACRO_KAPPA_THRESHOLD}`);
  });

  it('reports per-signal-type F1 to stderr for diagnostic visibility', () => {
    const result = precisionRecallF1(pairs);
    const top10 = Object.entries(result.per_type)
      .sort((a, b) => b[1].support - a[1].support)
      .slice(0, 10);
    if (process.env.RESILIENCE_GOLDEN_VERBOSE === '1') {
      console.error('[golden-corpus] top-10 signal types by support:');
      for (const [t, b] of top10) {
        console.error(`  ${t.padEnd(36)} P=${b.precision} R=${b.recall} F1=${b.f1} (TP=${b.tp} FP=${b.fp} FN=${b.fn})`);
      }
      console.error(`  micro: P=${result.micro.precision} R=${result.micro.recall} F1=${result.micro.f1}`);
    }
    assert.ok(true, 'always passes; diagnostic output only');
  });
});
