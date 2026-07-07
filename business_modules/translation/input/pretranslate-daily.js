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
} from '../../resilience_scorer/index.js';
import { localizeReportTodayPayload } from '../app/localizeReportToday.js';
import { warmDailyLocaleResources } from '../../../scripts/pretranslate-warm-resources.js';

const LOCALES = (process.env.PRETRANSLATE_LOCALES ?? 'he,ru')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s && s !== 'en');

function parseArgs(argv) {
  const out = { date: null, scope: 'national', runId: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--date') out.date = argv[++i];
    else if (a === '--scope') out.scope = argv[++i];
    else if (a === '--run') out.runId = argv[++i];
  }
  return out;
}

async function warmReport(date, scope, lang, runId) {
  const cached = getCachedReport(null, { scope, date, runId });
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
  const runId = args.runId ?? null;
  const date = args.date ?? (getAvailableReportDates({ scope }) ?? []).at(-1);
  if (!date) {
    console.error('No report date available');
    process.exit(1);
  }

  const allErrors = [];
  for (const lang of LOCALES) {
    await warmReport(date, scope, lang, runId);
    const resourceErrors = await warmDailyLocaleResources(date, lang);
    allErrors.push(...resourceErrors);
  }
  console.log('[pretranslate] done');
  if (allErrors.length) {
    console.error(`[pretranslate] ${allErrors.length} resource error(s)`);
    process.exit(1);
  }
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
