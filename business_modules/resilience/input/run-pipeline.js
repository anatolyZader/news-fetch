#!/usr/bin/env node
/**
 * Unified resilience pipeline orchestrator (/8comp-3, /8comp-3-north, cron).
 *
 * Usage:
 *   node run-pipeline.js [dd:mm:yyyy | YYYY-MM-DD] [--scope national|north] [--days 3] [--force]
 *   node run-pipeline.js --date 2026-04-15 --scope north
 *   node run-pipeline.js --ingest-only
 *   node run-pipeline.js --assess-only --date 2026-04-15 --scope north
 */
import 'dotenv/config';
import { bootstrapDefaultStateStore } from '../../../cross-cut-modules/persistence/bootstrapStateStore.js';

bootstrapDefaultStateStore();

import { parsePipelineCliArgs, runPipelineOrchestrator } from '../app/pipelineOrchestrator.js';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: run-pipeline.js [date] [options]

Date: dd:mm:yyyy or YYYY-MM-DD (default: today Asia/Jerusalem)

Options:
  --date <YYYY-MM-DD>   Target assessment date
  --days <N>            Assessment window (default 3, max 14)
  --scope <id>          national | north | south | … (default national)
  --force               Re-extract news/radio/whatsapp signals in window
  --no-transcribe       Skip radio transcription (today mode only)
  --no-social           Skip social OSINT gather
  --ingest-only         Run ingest steps only
  --assess-only         Skip ingest; run assess-signals only
  --plan-only           Print ingest plan and exit (no API calls, no extraction)
`);
  process.exit(0);
}

try {
  const opts = parsePipelineCliArgs(argv);
  await runPipelineOrchestrator(opts);
} catch (err) {
  console.error('run-pipeline failed:', err?.message ?? err);
  process.exit(1);
}
