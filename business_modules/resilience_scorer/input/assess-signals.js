#!/usr/bin/env node
/**
 * Stage-2 transport entry: assess pre-extracted signal bundles and write a resilience report.
 *
 * **Owns:** process bootstrap (dotenv, state store) and CLI exit handling only.
 * **Pipeline position:** after Stage-1 extraction (`extract-signals.js`); before report HTTP/UI.
 *
 * **Inputs:** CLI flags (`--date`, `--days`, `--scope`, optional `--output`) parsed in
 * `assessSignalsCli.js`; on-disk closed signal bundles under `data/signals/` and sibling
 * module paths (visits, social).
 *
 * **Outputs:** assessment JSON + sidecar artifacts via `finalizeReport.js` (report path
 * depends on scope/date).
 *
 * **Does NOT:** extract signals from raw MD, ingest news/social, or compute numeric
 * resilience scores (min-math: evidence counts + narrative only).
 *
 * **Collaborators:** `app/assessment/assessSignalsCli.js` (orchestration),
 * `app/assessment/assessmentStageRunner.js` (shared assess core),
 * `specialist_agents` (optional assessment agent path).
 *
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
