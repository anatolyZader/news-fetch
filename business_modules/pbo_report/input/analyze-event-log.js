#!/usr/bin/env node
/**
 * CLI entry (input layer) for PBO incident event log analysis.
 *
 * Usage:
 *   node business_modules/pbo_report/input/analyze-event-log.js --file <path-to-log.txt> [options]
 *   npm run analyze-event-log -- --file <path-to-log.txt>
 *   cat event-log.txt | node business_modules/pbo_report/input/analyze-event-log.js [options]
 */
import { runPboEventLogCli } from './pboEventLogInput.js';

runPboEventLogCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
