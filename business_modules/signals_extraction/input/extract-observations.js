#!/usr/bin/env node
/**
 * Open-vocabulary observation extraction CLI.
 * @see business_modules/signals_extraction/app/extractObservationsCli.js
 */
import 'dotenv/config';
import { runExtractObservationsCli } from '../app/extractObservationsCli.js';

try {
  await runExtractObservationsCli();
} catch (err) {
  console.error(err);
  process.exit(1);
}
