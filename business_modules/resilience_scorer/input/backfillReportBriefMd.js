#!/usr/bin/env node
/**
 * Regenerate operator -brief.md from existing report JSON files.
 * @see business_modules/resilience_scorer/app/backfillReportBriefMdCli.js
 */
import { runBackfillReportBriefMdCli } from '../app/backfillReportBriefMdCli.js';

runBackfillReportBriefMdCli(process.argv.slice(2));
