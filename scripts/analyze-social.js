#!/usr/bin/env node
/**
 * CLI: analyse Facebook group posts (Apify JSON export) for population resilience.
 *
 * One municipality at a time — each run produces one report file.
 * If the JSON covers multiple groups, processes each municipality separately.
 *
 * Usage:
 *   node scripts/analyze-social.js --file <path.json> [options]
 *
 * Options:
 *   --file         <path>        Apify Facebook JSON export  [required]
 *   --municipality <name>        Override municipality name for all posts in this file
 *   --date         <YYYY-MM-DD>  Override report date (default: today)
 *   --output       <dir>         Output directory (default: resilience/)
 *
 * Output filename: social-report-<date>-<municipality>.md/.json
 *
 * Requires: ANTHROPIC_API_KEY in environment or .env file.
 */

import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve, basename } from 'path';

import { parseSocialMediaJson } from '../src/resilience/socialMediaLoader.js';
import { analyzeMunicipalitySocialMedia } from '../src/resilience/socialMediaEvaluator.js';
import { writeSocialMediaReport } from '../src/resilience/socialMediaReportWriter.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const fileArg         = getArg('--file');
const municipalityArg = getArg('--municipality');
const dateArg         = getArg('--date');
const outputDir       = getArg('--output') ?? 'resilience';

if (!fileArg) {
  console.error('Usage: node scripts/analyze-social.js --file <path.json> [--municipality <name>] [--date YYYY-MM-DD]');
  process.exit(1);
}

const filePath   = resolve(fileArg);
const sourceFile = basename(filePath);
const date       = dateArg ?? new Date().toISOString().slice(0, 10);

// ─── Parse ────────────────────────────────────────────────────────────────────

let parsed;
try {
  parsed = parseSocialMediaJson(filePath, municipalityArg);
} catch (err) {
  console.error('Failed to parse input:', err.message);
  process.exit(1);
}

console.error(`\nSocial Media Resilience Analysis`);
console.error(`=================================`);
console.error(`File:          ${sourceFile}`);
console.error(`Date:          ${date}`);
console.error(`Total posts:   ${parsed.totalPosts}`);
console.error(`Relevant:      ${parsed.filteredPosts}`);
console.error(`Municipalities: ${parsed.municipalities.length} (${parsed.municipalities.map((m) => m.name).join(', ')})`);
console.error('');

// ─── Analyse one municipality at a time ───────────────────────────────────────

let completed = 0;

for (const mun of parsed.municipalities) {
  const slug     = mun.name.replace(/[/\\?%*:|"<> ]/g, '_');
  const outBase  = resolve(outputDir, `social-report-${date}-${slug}`);
  const mdPath   = `${outBase}.md`;

  if (existsSync(mdPath)) {
    console.error(`  ⏭  ${mun.name} — already exists, skipping`);
    continue;
  }

  console.error(`\n── ${mun.name} ──`);

  try {
    const assessment = await analyzeMunicipalitySocialMedia(mun, parsed.totalPosts, date);
    const { mdPath: written } = writeSocialMediaReport(assessment, sourceFile, outBase);
    console.error(`  ✓ Written → ${written}`);
    completed++;
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
  }

  if (completed < parsed.municipalities.length) {
    await new Promise((r) => setTimeout(r, 3000));
  }
}

console.error(`\nDone. ${completed} report(s) written.`);
