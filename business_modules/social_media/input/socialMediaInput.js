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

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0] ?? 'help';
  const opts = {};
  for (let i = 1; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--date' && args[i + 1]) {
      opts.date = args[++i];
      continue;
    }
    if (a === '--window-days' && args[i + 1]) {
      opts.windowDays = Number(args[++i]);
      continue;
    }
    if (a === '--days' && args[i + 1]) {
      opts.days = Number(args[++i]);
      continue;
    }
    if (a === '--max-per-query' && args[i + 1]) {
      opts.maxPerQuery = Number(args[++i]);
      continue;
    }
    if (a === '--max-cost-usd' && args[i + 1]) {
      opts.maxCostUsd = Number(args[++i]);
      continue;
    }
    if (a === '--platforms' && args[i + 1]) {
      opts.platforms = args[++i].split(',').map((p) => p.trim()).filter(Boolean);
      continue;
    }
    if (a === '--north') opts.north = true;
    if (a === '--execute') opts.execute = true;
    if (a === '--force') opts.force = true;
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

const { cmd, opts } = parseArgs(process.argv);
const service = createSocialMediaService();
const date = opts.date ?? todayJerusalem();

try {
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
  } else if (cmd === 'init') {
    await runInit(service, date, opts);
  } else if (cmd === 'treat') {
    await runTreat(service, date);
  } else if (cmd === 'gather-daily') {
    await runGatherDaily(service, date, opts);
  } else {
    console.error(`Unknown command: ${cmd}`);
    printHelp();
    process.exit(1);
  }
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}
