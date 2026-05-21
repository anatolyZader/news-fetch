#!/usr/bin/env node
/**
 * CLI for social-media OSINT gather scaffold and treatment.
 *
 * Usage:
 *   node business_modules/social_media/input/socialMediaInput.js init --date 2026-05-21
 *   node business_modules/social_media/input/socialMediaInput.js treat --date 2026-05-21
 */

import { createSocialMediaService } from '../app/socialMediaService.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0] ?? 'help';
  const opts = {};
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--date' && args[i + 1]) {
      opts.date = args[++i];
    } else if (args[i] === '--window-days' && args[i + 1]) {
      opts.windowDays = Number(args[++i]);
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
  init   Create empty OSINT bundle scaffold (--date YYYY-MM-DD)
  treat  Map findings → signals[] and save bundle (--date YYYY-MM-DD)
  help   Show this message
`);
}

async function main() {
  const { cmd, opts } = parseArgs(process.argv);
  const service = createSocialMediaService();
  const date = opts.date ?? todayJerusalem();

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'init') {
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
    return;
  }

  if (cmd === 'treat') {
    const { path, reportPath, signalCount } = await service.treatment.treatAndSave(date);
    console.log(`Treated ${path}`);
    console.log(`  report: ${reportPath}`);
    console.log(`  signals: ${signalCount}`);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
