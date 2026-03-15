#!/usr/bin/env node
/**
 * CLI: analyse daily news articles for population resilience across 8 components.
 *
 * Usage:
 *   node scripts/analyze-resilience.js [options]
 *
 * Options:
 *   --files  <f1.md,f2.md,...>   Comma-separated list of article MD files.
 *                                 Default: all articles-*.md in the current directory.
 *   --date   <YYYY-MM-DD>        Override the report date (default: parsed from files).
 *   --output <path>              Output path without extension (default: resilience/resilience-report-<date>).
 *
 * Requires:
 *   ANTHROPIC_API_KEY in environment (or .env file).
 */

import 'dotenv/config';
import { resolve, basename, dirname } from 'path';
import { existsSync } from 'fs';

import { loadMdFiles, findArticlesMdFiles } from '../src/resilience/mdReportsLoader.js';
import { extractEvidence, synthesizeComponents } from '../src/resilience/claudeEvaluator.js';
import { writeReport } from '../src/resilience/reportWriter.js';

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set. Add it to .env or the environment.');
  process.exit(1);
}

// ─── Resolve input files ──────────────────────────────────────────────────────

let filePaths;
const filesArg = getArg('--files');
if (filesArg) {
  filePaths = filesArg.split(',').map((f) => resolve(f.trim()));
} else {
  filePaths = findArticlesMdFiles('.');
}

if (filePaths.length === 0) {
  console.error(
    'No articles-*.md files found.\n' +
    'Run "npm run articles-to-md" first, or specify --files articles-ynet.md,articles-haaretz.md,...',
  );
  process.exit(1);
}

for (const fp of filePaths) {
  if (!existsSync(fp)) {
    console.error(`File not found: ${fp}`);
    process.exit(1);
  }
}

// ─── Load articles ────────────────────────────────────────────────────────────

const { articles, date: parsedDate, totalCount } = loadMdFiles(filePaths);
const reportDate = getArg('--date') ?? parsedDate;

const outputBase = getArg('--output')?.replace(/\.(md|json)$/, '')
  ?? resolve('resilience', `resilience-report-${reportDate}`);

const sourceFiles = filePaths.map((f) => basename(f));

console.error(`\nResilience Analysis`);
console.error(`===================`);
console.error(`Date:     ${reportDate}`);
console.error(`Sources:  ${sourceFiles.join(', ')}`);
console.error(`Articles: ${totalCount}`);
console.error(`Output:   ${outputBase}.(md|json)`);
console.error('');

// ─── Run analysis ─────────────────────────────────────────────────────────────

try {
  // Step 1 — evidence extraction
  const evidenceSnippets = await extractEvidence(articles);
  console.error(`  → ${evidenceSnippets.length} evidence snippets extracted\n`);

  // Step 2 — synthesis and scoring
  const assessment = await synthesizeComponents(evidenceSnippets, reportDate, totalCount);

  // Step 3 — write reports
  const { mdPath, jsonPath } = writeReport(assessment, evidenceSnippets, sourceFiles, outputBase);

  // ─── Summary ────────────────────────────────────────────────────────────
  console.error('\n=== Resilience Scores ===');
  for (const comp of assessment.components ?? []) {
    console.error(`  ${comp.component_id.padEnd(28)} ${comp.score}/10  (${comp.confidence})`);
  }
  console.error(`  ${'OVERALL'.padEnd(28)} ${assessment.overall_resilience_score}/10`);
  console.error('');
  console.error('Reports written:');
  console.error(`  ${mdPath}`);
  console.error(`  ${jsonPath}`);
} catch (err) {
  console.error('\nAnalysis failed:', err.message);
  if (err.status) console.error('API status:', err.status);
  process.exit(1);
}
