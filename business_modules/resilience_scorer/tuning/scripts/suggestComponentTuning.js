#!/usr/bin/env node
/**
 * Calibrate per-component (tanhK, certM) parameters from accumulated historical
 * resilience reports. ADVISORY ONLY — prints proposed tuning JSON.
 *
 * Usage:
 *   npm run suggest-tuning
 *   node business_modules/resilience_scorer/tuning/scripts/suggestComponentTuning.js [--diff]
 */

import { resolve } from 'node:path';
import { proposeComponentTuningFromReportFiles } from '../domain/componentTuningProposal.js';

const reportsDir = process.env.REPORTS_DIR
  ? resolve(process.env.REPORTS_DIR)
  : resolve(process.cwd(), 'business_modules/resilience_scorer/data/daily_reports');

const args = new Set(process.argv.slice(2));
const DIFF_ONLY = args.has('--diff');

function main() {
  const result = proposeComponentTuningFromReportFiles(reportsDir, { minReports: 1 });
  const files = result?.report_count ?? 0;

  if (files === 0) {
    console.error(`No national reports found in ${reportsDir}`);
    process.exit(1);
  }

  const proposals = result?.components ?? {};

  let output;
  if (DIFF_ONLY) {
    output = {};
    for (const [id, p] of Object.entries(proposals)) {
      if (!p.current || !p.proposed) continue;
      const movedK = p.proposed.tanhK != null && Math.abs(p.proposed.tanhK - p.current.tanhK) > 0.05;
      const movedM = p.proposed.certM != null && Math.abs(p.proposed.certM - p.current.certM) > 0.05;
      if (movedK || movedM) output[id] = p;
    }
    if (Object.keys(output).length === 0) {
      console.log(JSON.stringify({
        reportsDir,
        n_files: files,
        message: 'No component proposals moved by more than 0.05 from current.',
      }, null, 2));
      return;
    }
  } else {
    output = proposals;
  }

  console.log(JSON.stringify({
    reportsDir,
    n_files: files,
    advisory: 'Proposals are advisory. Current COMPONENT_TUNING in code stays untouched until a human edits it.',
    skipped_reason: result?.skipped_reason ?? null,
    components: output,
  }, null, 2));
}

main();
