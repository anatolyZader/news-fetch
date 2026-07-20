#!/usr/bin/env node
/**
 * Stage-1 CLI transport entry: extract behavioral signals from one source type.
 *
 * Pipeline position: first operational stage of the daily pipeline. Thin socket —
 * parses nothing itself; delegates to app/extraction/extractSignalsCli.js.
 *
 * Owns: process bootstrap (dotenv), top-level error handling / exit codes.
 * Does NOT: run LLM extraction or write signal bundles (that's extractSignalsCli
 * → extractionStageRunner → closed/open extract services).
 *
 * Invoke via npm script `extract-signals` or `node …/input/extract-signals.js`.
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
