#!/usr/bin/env node
import 'dotenv/config';
import { runAnalysis } from '../api/analysisService.js';
import { createEvidenceStore } from '../cross-cut-modules/persistence/evidenceStore.js';

const store = createEvidenceStore('data/app.sqlite');
const today = '2026-03-22';

console.log('=== E2E test: DB-backed multi-source analysis ===');
const items = store.getByDate(today);
const types = [...new Set(items.map(i => i.source_type))];
console.log(`DB: ${items.length} items | types: ${types.join(', ')}`);

const { assessment, costUsd, date } = await runAnalysis({
  store,
  onProgress: (e) => {
    if (e.type === 'progress') console.log(`[${e.step}] ${e.message}`);
    else if (e.type === 'usage') console.log(`[cost] $${e.costUsd.toFixed(4)}`);
  },
});

console.log(`\n✅ Analysis complete for ${date}`);
console.log(`Overall score: ${assessment.overallScore ?? assessment.overall_score}`);
console.log(`Cost: $${costUsd.toFixed(4)}`);
(assessment.components ?? []).forEach(c => console.log(`  ${c.id || c.name}: ${c.score}`));

const run = store.getLatestRunForDate(today);
console.log(`\nDB run saved: ${run ? 'yes' : 'NO — ERROR'}`);
if (run) {
  console.log(`  sourceTypes: ${run.sourceTypes?.join(', ')}`);
  console.log(`  totalItems: ${run.totalItems}`);
  console.log(`  totalSignals: ${run.totalSignals}`);
}
