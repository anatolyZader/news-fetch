#!/usr/bin/env node
/**
 * Print validation / calibration readiness summary from validation-config + artifacts.
 *
 * Usage:
 *   npm run validation:status
 */

import { summarizeValidationMaturity } from '../domain/validationStatus.js';

function main() {
  const summary = summarizeValidationMaturity();
  console.log(JSON.stringify(summary, null, 2));
}

main();
