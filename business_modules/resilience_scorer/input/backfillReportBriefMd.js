#!/usr/bin/env node
/**
 * Regenerate operator -brief.md from existing report JSON files.
 * @see business_modules/resilience_scorer/app/assessment/backfillReportBriefMdCli.js
 */
import { runBackfillReportBriefMdCli } from '../app/assessment/backfillReportBriefMdCli.js';

runBackfillReportBriefMdCli(process.argv.slice(2));
