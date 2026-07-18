#!/usr/bin/env node
/**
 * Stage-1 CLI: extract behavioral signals from one source type and persist JSON artifacts.
 * @see business_modules/resilience_scorer/app/extraction/extractSignalsCli.js
 */
import 'dotenv/config';
import { runExtractSignalsCli } from '../app/extraction/extractSignalsCli.js';

try {
  await runExtractSignalsCli();
} catch (err) {
  console.error('extract-signals failed:', err?.message ?? err);
  process.exit(1);
}
