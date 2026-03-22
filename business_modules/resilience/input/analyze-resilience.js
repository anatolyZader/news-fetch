#!/usr/bin/env node
/**
 * CLI entry (input layer) for news/audio-transcript markdown → 8-component resilience assessment.
 *
 * Usage:
 *   npm run analyze-resilience -- --files articles-homefront.md --date YYYY-MM-DD
 *   node business_modules/resilience/input/analyze-resilience.js [options]
 */
import { runAnalyzeResilienceCli } from './analyzeResilienceInput.js';

runAnalyzeResilienceCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
