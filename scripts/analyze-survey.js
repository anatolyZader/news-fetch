#!/usr/bin/env node
/**
 * CLI: analyse field survey responses (Google Forms Excel) for population resilience.
 *
 * Runs one municipality at a time — each gets a full independent analysis
 * (Step 1 + Step 2) and its own output file.
 *
 * Usage:
 *   node scripts/analyze-survey.js --responses <path.xlsx> [options]
 *
 * Options:
 *   --responses    <path>        Google Forms Excel export (.xlsx)  [required]
 *   --mapping      <path>        Question-component mapping JSON
 *                                (default: resilience/survey-question-mapping.json)
 *   --municipality <name>        Analyse only this municipality (exact name)
 *   --date         <YYYY-MM-DD>  Override report date (default: today)
 *   --list                       List available municipality names and exit
 *
 * Requires: ANTHROPIC_API_KEY in environment or .env file.
 */

import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve, basename } from 'path';

import { parseSurveyExcel } from '../src/resilience/surveyLoader.js';
import { analyzeSurvey } from '../src/resilience/surveyEvaluator.js';
import { writeMunicipalityReports } from '../src/resilience/surveyReportWriter.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const hasFlag = (flag) => args.includes(flag);

const responsesArg   = getArg('--responses');
const mappingArg     = getArg('--mapping') ?? 'resilience/survey-question-mapping.json';
const municipalityArg = getArg('--municipality');
const dateArg        = getArg('--date');
const listMode       = hasFlag('--list');

if (!responsesArg) {
  console.error('Usage: node scripts/analyze-survey.js --responses <path.xlsx> [--municipality <name>] [--date YYYY-MM-DD]');
  process.exit(1);
}

// ─── Parse Excel ──────────────────────────────────────────────────────────────

const responsesPath = resolve(responsesArg);
const mappingPath   = resolve(mappingArg);
const sourceFile    = basename(responsesPath);
const date          = dateArg ?? new Date().toISOString().slice(0, 10);

let parsed;
try {
  parsed = parseSurveyExcel(responsesPath, mappingPath);
} catch (err) {
  console.error('Failed to parse input:', err.message);
  process.exit(1);
}

// ─── --list mode ──────────────────────────────────────────────────────────────

if (listMode) {
  console.log(`${parsed.municipalities.length} municipalities in ${sourceFile}:\n`);
  parsed.municipalities.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m.name}`));
  process.exit(0);
}

// ─── Select municipalities to process ─────────────────────────────────────────

let toProcess;
if (municipalityArg) {
  toProcess = parsed.municipalities.filter((m) => m.name === municipalityArg);
  if (toProcess.length === 0) {
    console.error(`Municipality "${municipalityArg}" not found. Run with --list to see available names.`);
    process.exit(1);
  }
} else {
  toProcess = parsed.municipalities;
}

console.error(`\nField Survey Resilience Analysis — per municipality`);
console.error(`===================================================`);
console.error(`Source:          ${sourceFile}`);
console.error(`Date:            ${date}`);
console.error(`To analyse:      ${toProcess.length} municipalit${toProcess.length === 1 ? 'y' : 'ies'}`);
console.error('');

// ─── Process one municipality at a time ───────────────────────────────────────

let completed = 0;
let skipped   = 0;

for (const mun of toProcess) {
  const slug     = mun.name.replace(/[/\\?%*:|"<> ]/g, '_');
  const outPath  = resolve('resilience', `survey-report-${date}-${slug}`);
  const mdPath   = `${outPath}.md`;

  // Skip if already done
  if (existsSync(mdPath)) {
    console.error(`  ⏭  ${mun.name} — already exists, skipping`);
    skipped++;
    continue;
  }

  console.error(`\n── ${mun.name} (${completed + skipped + 1}/${toProcess.length}) ──`);

  try {
    // Pass single municipality — treated as its own "region"
    const assessment = await analyzeSurvey([mun], date, `${slug}.xlsx`);

    writeMunicipalityReports(assessment.municipalities, date, sourceFile, 'resilience', assessment.regional);

    console.error(`  ✓ Written → ${mdPath}`);
    completed++;
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    // Continue with next municipality rather than aborting
  }

  // Pause between municipalities to avoid rate limiting
  if (completed + skipped < toProcess.length) {
    await new Promise((r) => setTimeout(r, 3000));
  }
}

console.error(`\n═══════════════════════════════`);
console.error(`Done. Completed: ${completed}  Skipped: ${skipped}  Failed: ${toProcess.length - completed - skipped}`);
