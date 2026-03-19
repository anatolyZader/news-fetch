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
import { existsSync, readFileSync, readdirSync } from 'fs';

import { loadMdFiles, findArticlesMdFiles } from '../src/resilience/mdReportsLoader.js';
import { extractSignals, generateNarratives } from '../src/resilience/claudeEvaluator.js';
import { scoreComponents } from '../src/resilience/behaviorSignals.js';
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

// ─── Token cost tracking ──────────────────────────────────────────────────────

const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
};

const usageLog = [];
let totalCostUsd = 0;

const MAX_COST_USD = 3.00;

function onUsage({ label, model, usage }) {
  const p = PRICING[model];
  const cost = p
    ? (usage.input_tokens / 1_000_000) * p.input + (usage.output_tokens / 1_000_000) * p.output
    : 0;
  totalCostUsd += cost;
  usageLog.push({ label, model, usage, cost });
  console.error(
    `  💰 ${label.padEnd(38)} in: ${String(usage.input_tokens).padStart(6)}  out: ${String(usage.output_tokens).padStart(6)}  $${cost.toFixed(4)}`
  );
  if (totalCostUsd > MAX_COST_USD) {
    console.error(`\n🛑  Cost cap $${MAX_COST_USD} exceeded (running total: $${totalCostUsd.toFixed(4)}) — terminating.`);
    console.error('\nPartial token usage:');
    for (const e of usageLog) {
      console.error(`  ${e.label.padEnd(38)} $${e.cost.toFixed(4)}`);
    }
    console.error(`  ${'TOTAL'.padEnd(38)} $${totalCostUsd.toFixed(4)}`);
    process.exit(1);
  }
}

// ─── Resolve input files ──────────────────────────────────────────────────────

let filePaths;
const filesArg = getArg('--files');
if (filesArg) {
  filePaths = filesArg.split(',').map((f) => resolve(f.trim()));
} else {
  // Default: articles-homefront.md contains pre-filtered articles from all sources
  filePaths = [resolve('articles-homefront.md')];
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

const { articles: rawArticles, date: parsedDate, totalCount } = loadMdFiles(filePaths);
const reportDate = getArg('--date') ?? parsedDate;

// Deduplicate cross-site articles: same story covered by multiple outlets
// Key = first 40 non-punctuation chars of the Hebrew/English title
const _seen = new Set();
const articles = rawArticles.filter((a) => {
  const key = a.title.replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
  if (_seen.has(key)) return false;
  _seen.add(key);
  return true;
});

// Timestamp suffix: YYYY-MM-DD-HHmm (colons not safe in filenames)
const now = new Date();
const timeSuffix = now.toTimeString().slice(0, 5).replace(':', '');
const outputBase = getArg('--output')?.replace(/\.(md|json)$/, '')
  ?? resolve('resilience', `resilience-report-${reportDate}-${timeSuffix}`);

const sourceFiles = filePaths.map((f) => basename(f));

console.error(`\nResilience Analysis`);
console.error(`===================`);
console.error(`Date:     ${reportDate}`);
console.error(`Sources:  ${sourceFiles.join(', ')}`);
console.error(`Articles: ${articles.length} unique (${totalCount} total, ${totalCount - articles.length} cross-site dupes removed)`);
console.error(`Output:   ${outputBase}.(md|json)`);
console.error('');

// ─── Load prior reports for trend context ─────────────────────────────────────

function loadPriorReports(date, n = 2) {
  const dir = resolve('resilience');
  const allFiles = existsSync(dir) ? readdirSync(dir) : [];
  const priorReports = [];
  const d = new Date(date);
  for (let i = 1; i <= n; i++) {
    const prior = new Date(d);
    prior.setDate(d.getDate() - i);
    const priorDate = prior.toISOString().slice(0, 10);
    // Match resilience-report-YYYY-MM-DD*.json — pick the last (latest) by filename sort
    const matches = allFiles
      .filter((f) => f.startsWith(`resilience-report-${priorDate}`) && f.endsWith('.json'))
      .sort();
    const file = matches.at(-1);
    if (file) {
      try {
        const json = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
        priorReports.unshift(json.assessment); // chronological order (oldest first)
      } catch {
        console.error(`  ⚠ Could not parse prior report: ${file}`);
      }
    }
  }
  return priorReports;
}

const priorReports = loadPriorReports(reportDate);
if (priorReports.length > 0) {
  console.error(`Prior context: ${priorReports.map((r) => r.date).join(', ')}\n`);
} else {
  console.error(`Prior context: none found\n`);
}

// ─── Run analysis ─────────────────────────────────────────────────────────────

try {
  // Step 1 — signal extraction (closed vocabulary, auto-batched)
  const signals = await extractSignals(articles, { onUsage });
  console.error(`  → ${signals.length} total behavioral signals extracted\n`);

  // Step 1b — map signals to components (deterministic, no LLM)
  const scoredComponents = scoreComponents(signals);
  for (const [id, c] of Object.entries(scoredComponents)) {
    console.error(`  → ${id.padEnd(28)} conf=${c.confidence} (${c.signal_count} signals)`);
  }
  console.error('');

  // Step 2 — narrative generation (Sonnet writes text, does not score)
  const assessment = await generateNarratives(scoredComponents, signals, reportDate, totalCount, { onUsage, priorReports });

  // Step 3 — write reports
  const { mdPath, jsonPath } = writeReport(assessment, signals, sourceFiles, outputBase);

  // ─── Summary ────────────────────────────────────────────────────────────
  console.error('\n=== Resilience Components ===');
  for (const comp of assessment.components ?? []) {
    console.error(`  ${comp.component_id.padEnd(28)} (${comp.confidence}, ${comp.signal_count ?? 0} signals)`);
  }
  console.error('');
  const haikuCost = usageLog.filter(e => e.model.includes('haiku')).reduce((s, e) => s + e.cost, 0);
  const sonnetCost = usageLog.filter(e => e.model.includes('sonnet')).reduce((s, e) => s + e.cost, 0);
  const opusCost = usageLog.filter(e => e.model.includes('opus')).reduce((s, e) => s + e.cost, 0);
  console.error(`💰 Total cost: $${totalCostUsd.toFixed(4)}  (Haiku: $${haikuCost.toFixed(4)}  |  Sonnet: $${sonnetCost.toFixed(4)}  |  Opus: $${opusCost.toFixed(4)})`);
  console.error('');
  console.error('Reports written:');
  console.error(`  ${mdPath}`);
  console.error(`  ${jsonPath}`);
} catch (err) {
  console.error('\nAnalysis failed:', err.message);
  if (err.status) console.error('API status:', err.status);
  process.exit(1);
}
