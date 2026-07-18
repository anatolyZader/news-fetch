#!/usr/bin/env node
/**
 * Stage-2 CLI: load pre-extracted signal files, score per-source + full, narrate once, write report.
 * @see business_modules/resilience_scorer/app/assessment/assessSignalsCli.js
 */
import 'dotenv/config';
import { bootstrapDefaultStateStore } from '../../../cross-cut-modules/persistence/bootstrapStateStore.js';

bootstrapDefaultStateStore();

import { runAssessSignalsCli } from '../app/assessment/assessSignalsCli.js';

try {
  await runAssessSignalsCli();
} catch (err) {
  console.error('assess-signals failed:', err?.message ?? err);
  process.exit(1);
}
