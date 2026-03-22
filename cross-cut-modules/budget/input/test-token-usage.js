#!/usr/bin/env node
/**
 * Token/cost audit against the news resilience pipeline (uses claudeEvaluator).
 *
 * Usage:
 *   node cross-cut-modules/budget/input/test-token-usage.js [YYYY-MM-DD]
 *   npm run test-tokens -- [YYYY-MM-DD]
 */
import { runTestTokenUsageCli } from './testTokenUsageInput.js';

runTestTokenUsageCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
