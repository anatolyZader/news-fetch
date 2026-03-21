#!/usr/bin/env node
/**
 * CLI: analyse daily news (or radio transcript) markdown for population resilience across 8 components.
 *
 * Options:
 *   --files  <f1.md,f2.md,...>   Comma-separated list of article MD files (default: articles-homefront.md)
 *   --date   <YYYY-MM-DD>        Override the report date (default: parsed from files).
 *   --output <path>              Output path without extension (default: resilience/resilience-report-<date>-<time>).
 *   --content-kind news|radio    Default news. Radio uses transcript prompts and skips title dedupe.
 *   --no-dedupe                  Keep all sections even if titles match.
 */

import 'dotenv/config';
import { resolve, basename } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

import { loadMdFiles } from '../src/resilience/mdReportsLoader.js';
import { runResilienceAnalysis } from '../src/resilience/runResilienceAnalysis.js';
import { scoreComponents } from '../src/resilience/behaviorSignals.js';
import { writeReport } from '../src/resilience/reportWriter.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../src/costTracker.js';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set. Add it to .env or the environment.');
  process.exit(1);
}

checkDailyBudget();

const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'analyze-resilience' });

let filePaths;
const filesArg = getArg('--files');
if (filesArg) {
  filePaths = filesArg.split(',').map((f) => resolve(f.trim()));
} else {
  filePaths = [resolve('articles-homefront.md')];
}

for (const fp of filePaths) {
  if (!existsSync(fp)) {
    console.error(`File not found: ${fp}`);
    process.exit(1);
  }
}

const contentKind = getArg('--content-kind') === 'radio' ? 'radio' : 'news';
const explicitNoDedupe = args.includes('--no-dedupe');
const dedupeTitles = explicitNoDedupe ? false : contentKind !== 'radio';

const { date: parsedDate } = loadMdFiles(filePaths);
const reportDateArg = getArg('--date');
const reportDateForPrior = reportDateArg ?? parsedDate;

function loadPriorReports(date, n = 2) {
  const dir = resolve('resilience');
  const allFiles = existsSync(dir) ? readdirSync(dir) : [];
  const priorReports = [];
  const d = new Date(date);
  for (let i = 1; i <= n; i++) {
    const prior = new Date(d);
    prior.setDate(d.getDate() - i);
    const priorDate = prior.toISOString().slice(0, 10);
    const matches = allFiles
      .filter((f) => f.startsWith(`resilience-report-${priorDate}`) && f.endsWith('.json'))
      .sort();
    const file = matches.at(-1);
    if (file) {
      try {
        const json = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
        priorReports.unshift(json.assessment);
      } catch {
        console.error(`  ⚠ Could not parse prior report: ${file}`);
      }
    }
  }
  return priorReports;
}

const priorReports = loadPriorReports(reportDateForPrior);

const now = new Date();
const timeSuffix = now.toTimeString().slice(0, 5).replace(':', '');

const sourceFiles = filePaths.map((f) => basename(f));

console.error(`\nResilience Analysis (${contentKind})`);
console.error(`===================`);
console.error(`Sources:  ${sourceFiles.join(', ')}`);
if (priorReports.length > 0) {
  console.error(`Prior context: ${priorReports.map((r) => r.date).join(', ')}\n`);
} else {
  console.error(`Prior context: none found\n`);
}

try {
  const {
    assessment,
    signals,
    articles,
    totalCount,
    reportDate,
  } = await runResilienceAnalysis({
    filePaths,
    reportDate: reportDateArg ?? undefined,
    contentKind,
    dedupeTitles,
    onUsage,
    priorReports,
  });

  const outputBase = getArg('--output')?.replace(/\.(md|json)$/, '')
    ?? resolve('resilience', `resilience-report-${reportDate}-${timeSuffix}`);

  console.error(`Date:     ${reportDate}`);
  console.error(
    `Articles: ${articles.length} analyzed (${totalCount} in file${dedupeTitles ? `, ${totalCount - articles.length} deduped` : ''})`,
  );
  console.error(`Output:   ${outputBase}.(md|json)`);
  console.error('');

  const scoredComponents = scoreComponents(signals, { totalArticles: articles.length });
  console.error(`  → ${signals.length} total behavioral signals extracted\n`);
  for (const [id, c] of Object.entries(scoredComponents)) {
    const cert = c.certainty != null ? ` cert=${(c.certainty * 100).toFixed(0)}%` : '';
    console.error(`  → ${id.padEnd(28)} score=${c.score ?? 'n/a'} conf=${c.confidence}${cert} (${c.signal_count} signals)`);
  }
  console.error('');

  const { mdPath, jsonPath } = writeReport(assessment, signals, sourceFiles, outputBase);

  console.error('\n=== Resilience Components ===');
  for (const comp of assessment.components ?? []) {
    console.error(`  ${comp.component_id.padEnd(28)} (${comp.confidence}, ${comp.signal_count ?? 0} signals)`);
  }
  console.error('');
  printSummary();
  console.error('');
  console.error('Reports written:');
  console.error(`  ${mdPath}`);
  console.error(`  ${jsonPath}`);

  const { totalCostUsd, usageLog } = getTotal();
  appendCostLog({
    script: contentKind === 'radio' ? 'analyze-radio' : 'analyze-resilience',
    date: reportDate,
    totalCostUsd,
    usageLog,
    articles: articles.length,
  });
} catch (err) {
  console.error('\nAnalysis failed:', err.message);
  if (err.status) console.error('API status:', err.status);
  process.exit(1);
}
