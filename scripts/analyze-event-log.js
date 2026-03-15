#!/usr/bin/env node
/**
 * CLI: analyse a PBO Incident Event Log for population resilience across 8 components.
 *
 * Usage:
 *   node scripts/analyze-event-log.js --file <path-to-log.txt> [options]
 *   cat event-log.txt | node scripts/analyze-event-log.js [options]
 *
 * Options:
 *   --file   <path>        Input event log file (pipe-delimited). If omitted, reads stdin.
 *   --date   <YYYY-MM-DD>  Override the report date (default: today).
 *   --output <path>        Output path without extension (default: resilience/event-report-<date>).
 *
 * Requires:
 *   ANTHROPIC_API_KEY in environment or .env file.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, basename } from 'path';

import { parseEventLog, inferDate } from '../src/resilience/eventLogLoader.js';
import { classifyEvents, synthesizeFromEvents } from '../src/resilience/eventLogEvaluator.js';
import { writeEventReport } from '../src/resilience/eventLogReportWriter.js';

// ─── Env check ────────────────────────────────────────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set. Add it to .env or the environment.');
  process.exit(1);
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};

const fileArg = getArg('--file');
const dateArg = getArg('--date');
const outputArg = getArg('--output');

// ─── Read input ───────────────────────────────────────────────────────────────

let rawText;
let sourceName;

if (fileArg) {
  const filePath = resolve(fileArg);
  rawText = readFileSync(filePath, 'utf-8');
  sourceName = basename(filePath);
} else {
  // Read from stdin
  rawText = readFileSync('/dev/stdin', 'utf-8');
  sourceName = 'stdin';
}

// ─── Parse ────────────────────────────────────────────────────────────────────

const parsedLog = parseEventLog(rawText, sourceName);

if (parsedLog.events.length === 0) {
  console.error('No events found in input. Check the format:\n  time | actor | behavior | category | context | source');
  process.exit(1);
}

const reportDate = dateArg ?? inferDate(parsedLog, new Date().toISOString().slice(0, 10));
const outputBase =
  outputArg?.replace(/\.(md|json)$/, '') ??
  resolve('resilience', `event-report-${reportDate}`);

console.error(`\nPBO Event Log Resilience Analysis`);
console.error(`==================================`);
console.error(`Log:    ${parsedLog.title}`);
console.error(`Date:   ${reportDate}`);
console.error(`Source: ${sourceName}`);
console.error(`Events: ${parsedLog.events.length}`);
console.error(`Output: ${outputBase}.(md|json)`);
console.error('');

// ─── Analyse ──────────────────────────────────────────────────────────────────

try {
  // Step 1 — classify events
  const classifications = await classifyEvents(parsedLog);
  console.error(`  → ${classifications.length} events classified\n`);

  // Step 2 — synthesise and score
  const assessment = await synthesizeFromEvents(parsedLog, classifications, reportDate);

  // Step 3 — write reports
  const { mdPath, jsonPath } = writeEventReport(
    assessment,
    classifications,
    parsedLog,
    sourceName,
    outputBase,
  );

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.error('\n=== Resilience Scores ===');
  for (const comp of assessment.components ?? []) {
    const trend = { improving: '↑', stable: '→', degrading: '↓', unclear: '?' }[comp.temporal_trend] ?? '';
    console.error(
      `  ${comp.component_id.padEnd(28)} ${comp.score}/10  (${comp.confidence}) ${trend}`,
    );
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
