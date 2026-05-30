#!/usr/bin/env node
/**
 * CLI for social-media OSINT gather scaffold and treatment.
 *
 * Usage:
 *   node business_modules/social_media/input/socialMediaInput.js init --date 2026-05-21
 *   node business_modules/social_media/input/socialMediaInput.js treat --date 2026-05-21
 *   node business_modules/social_media/input/socialMediaInput.js gather-daily --date 2026-05-23 --days 3 --north --execute
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocialMediaService } from '../app/socialMediaService.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: resolve(REPO_ROOT, '.env') });

const NUMERIC_OPTS = new Set(['--window-days', '--days', '--max-per-query', '--max-cost-usd']);
const STRING_OPTS = {
  '--date': 'date',
  '--window-days': 'windowDays',
  '--days': 'days',
  '--max-per-query': 'maxPerQuery',
  '--max-cost-usd': 'maxCostUsd',
};
const BOOL_OPTS = {
  '--north': 'north',
  '--execute': 'execute',
  '--force': 'force',
};

function assignOptValue(opts, flag, raw) {
  if (flag === '--platforms') {
    opts.platforms = raw.split(',').map((p) => p.trim()).filter(Boolean);
    return;
  }
  const key = STRING_OPTS[flag];
  if (!key) return;
  opts[key] = NUMERIC_OPTS.has(flag) ? Number(raw) : raw;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0] ?? 'help';
  const opts = {};
  for (let i = 1; i < args.length; i += 1) {
    const a = args[i];
    const boolKey = BOOL_OPTS[a];
    if (boolKey) {
      opts[boolKey] = true;
      continue;
    }
    if (STRING_OPTS[a] && args[i + 1]) {
      assignOptValue(opts, a, args[++i]);
    }
  }
  return { cmd, opts };
}

function todayJerusalem() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function printHelp() {
  console.log(`Social media OSINT module

Commands:
  init          Create empty OSINT bundle scaffold (--date YYYY-MM-DD)
  treat         Map findings → signals[] and save bundle (--date YYYY-MM-DD)
  gather-daily  Fetch X + Telegram homefront evidence for a date window
                (--date YYYY-MM-DD --days 3 --north --execute --force)
  help          Show this message
`);
}

async function runInit(service, date, opts) {
  const existing = await service.gather.loadBundle(date);
  if (existing) {
    console.error(`Bundle already exists for ${date}. Refusing to overwrite.`);
    process.exit(1);
  }
  const bundle = service.gather.createEmptyBundle({
    date,
    windowDays: opts.windowDays ?? 7,
  });
  const { path } = await service.gather.saveBundle(date, bundle);
  console.log(`Created OSINT scaffold: ${path}`);
  console.log(`  gather_queries: ${bundle.gather_queries.length}`);
}

async function runTreat(service, date) {
  const { path, reportPath, signalCount } = await service.treatment.treatAndSave(date);
  console.log(`Treated ${path}`);
  console.log(`  report: ${reportPath}`);
  console.log(`  signals: ${signalCount}`);
}

async function runGatherDaily(service, date, opts) {
  const result = await service.gatherDaily({
    date,
    days: opts.days ?? 3,
    north: Boolean(opts.north),
    execute: Boolean(opts.execute),
    force: Boolean(opts.force),
    platforms: opts.platforms,
    maxPerQuery: opts.maxPerQuery,
    maxCostUsd: opts.maxCostUsd,
  });
  console.log(JSON.stringify(result, null, 2));
  for (const note of result.accessNotes ?? []) {
    console.error(`  ℹ ${note}`);
  }
  if (result.bundlePaths?.length) {
    console.error(`  Bundles: ${result.bundlePaths.join(', ')}`);
  }
  if (result.treatedDates?.length) {
    console.error(`  Treated dates: ${result.treatedDates.join(', ')}`);
  }
}

async function runCommand(cmd, service, date, opts) {
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }
  if (cmd === 'init') {
    await runInit(service, date, opts);
    return;
  }
  if (cmd === 'treat') {
    await runTreat(service, date);
    return;
  }
  if (cmd === 'gather-daily') {
    await runGatherDaily(service, date, opts);
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

const { cmd, opts } = parseArgs(process.argv);
const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
let retrievalService = null;
if (cmd === 'gather-daily') {
  retrievalService = createRetrievalService({ dbPath: sqlitePath });
}
const service = createSocialMediaService({ retrievalService });
const date = opts.date ?? todayJerusalem();

try {
  await runCommand(cmd, service, date, opts);
  if (retrievalService) {
    if (process.env.SOCIAL_EXAMPLES_AUTO_REINDEX === '1') {
      const r = await retrievalService.socialExamplesIndexWriter.reindexSocialExamples({ days: 30 });
      retrievalService.rebuildFts();
      console.error(`Social examples auto-reindex: ${r.chunks} chunk(s)`);
    }
    retrievalService.close();
  }
} catch (err) {
  if (retrievalService) retrievalService.close();
  console.error(err.message ?? err);
  process.exit(1);
}
