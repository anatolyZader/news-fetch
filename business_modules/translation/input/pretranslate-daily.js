#!/usr/bin/env node
/**
 * Warm locale presentation caches for he/ru after daily assess.
 *
 * Usage:
 *   node business_modules/translation/input/pretranslate-daily.js [--date YYYY-MM-DD] [--scope national]
 *
 * Env: PRETRANSLATE_LOCALES=he,ru (default), TRANSLATION_ENABLED=true
 */
import 'dotenv/config';
import {
  getAvailableReportDates,
  getCachedReport,
  redactReportPayload,
  DISPLAY_VIEWS,
} from '../../resilience/index.js';
import { localizeReportTodayPayload } from '../app/localizeReportToday.js';

const LOCALES = (process.env.PRETRANSLATE_LOCALES ?? 'he,ru')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s && s !== 'en');

function parseArgs(argv) {
  const out = { date: null, scope: 'national' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--date') out.date = argv[++i];
    else if (a === '--scope') out.scope = argv[++i];
  }
  return out;
}

async function warmReport(date, scope, lang) {
  const cached = getCachedReport(null, { scope, date });
  if (!cached?.assessment) {
    console.warn(`[pretranslate] no report for ${date} scope=${scope}`);
    return;
  }
  const redacted = redactReportPayload(cached, DISPLAY_VIEWS.operator);
  await localizeReportTodayPayload({ found: true, display_view: DISPLAY_VIEWS.operator, ...redacted }, lang);
  console.log(`[pretranslate] report ${date} ${scope} ${lang}`);
}

async function main() {
  if (process.env.TRANSLATION_ENABLED !== 'true') {
    console.error('TRANSLATION_ENABLED must be true');
    process.exit(1);
  }
  const args = parseArgs(process.argv);
  const scope = args.scope ?? 'national';
  const date = args.date ?? (getAvailableReportDates({ scope }) ?? []).at(-1);
  if (!date) {
    console.error('No report date available');
    process.exit(1);
  }

  for (const lang of LOCALES) {
    await warmReport(date, scope, lang);
  }
  console.log('[pretranslate] done');
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
