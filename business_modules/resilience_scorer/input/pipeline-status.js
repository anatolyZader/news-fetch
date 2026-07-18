#!/usr/bin/env node
/**
 * CLI: pipeline run status from SQLite metadata.
 * Usage: node business_modules/resilience_scorer/input/pipeline-status.js --date 2026-06-02
 */
import { createPipelineRunStore } from '../../../db/persistence/pipelineRunStore.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const date = getArg('--date') ?? new Date().toISOString().slice(0, 10);
const sqlitePath = resolveSqlitePath();

const store = createPipelineRunStore(sqlitePath);
const runs = store.listByDate(date);

if (runs.length === 0) {
  console.log(`No pipeline runs for ${date}`);
  process.exit(0);
}

for (const run of runs) {
  console.log(`\n${run.runKey} (scope=${run.reportScopeId})`);
  for (const [stage, info] of Object.entries(run.stages)) {
    console.log(`  ${stage}: ${info.status} @ ${info.at}`);
  }
}
