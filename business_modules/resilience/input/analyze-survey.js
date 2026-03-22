#!/usr/bin/env node
/**
 * CLI entry: municipality field survey (Excel) → per-municipality reports.
 * Usage: npm run analyze-survey -- --responses <path.xlsx> [options]
 */
import { runAnalyzeSurveyCli } from './analyzeSurveyInput.js';

runAnalyzeSurveyCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
