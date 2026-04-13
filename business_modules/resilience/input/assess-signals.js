#!/usr/bin/env node
/**
 * Stage-2 CLI: load pre-extracted signal files, score per-source + full, narrate once, write report.
 *
 * Usage:
 *   node assess-signals.js --date YYYY-MM-DD [--days 1|3] [--output <path-without-ext>]
 *
 * Auto-discovers signals/signals-{type}-{date}.json for the requested date window.
 * Temporal weights: today=1.0, T-1=0.85, T-2=0.70
 */

import 'dotenv/config';
import { resolve } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

import { scoreComponents } from '../domain/services/behaviorSignals.js';
import { generateNarratives } from '../infrastructure/claudeEvaluator.js';
import { writeReport } from '../infrastructure/reportWriter.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';

const TEMPORAL_WEIGHTS = { 0: 1.00, 1: 0.85, 2: 0.70 };

function dateOffset(fileDate, targetDate) {
  const a = new Date(fileDate);
  const b = new Date(targetDate);
  return Math.round((b - a) / 86_400_000);
}

function loadPriorReports(targetDate, n = 2) {
  const dir = resolve('reports');
  if (!existsSync(dir)) return [];
  const allFiles = readdirSync(dir);
  const prior = [];
  const d = new Date(targetDate);
  for (let i = 1; i <= n; i++) {
    const p = new Date(d);
    p.setDate(d.getDate() - i);
    const pd = p.toISOString().slice(0, 10);
    const match = allFiles.filter((f) => f.startsWith(`resilience-report-${pd}`) && f.endsWith('.json')).sort().at(-1);
    if (match) {
      try {
        const json = JSON.parse(readFileSync(resolve(dir, match), 'utf8'));
        prior.unshift(json.assessment);
      } catch { /* ignore */ }
    }
  }
  return prior;
}

async function run() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

  const targetDate = getArg('--date') ?? new Date().toISOString().slice(0, 10);
  const days = Math.min(3, Math.max(1, parseInt(getArg('--days') ?? '1', 10)));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  checkDailyBudget();

  // Discover signal files for the requested date window
  const signalsDir = resolve('signals');
  if (!existsSync(signalsDir)) {
    console.error(`No signals/ directory found. Run extract-signals.js first.`);
    process.exit(1);
  }

  const allFiles = readdirSync(signalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'));

  // Build date set to include
  const targetDates = new Set();
  const base = new Date(targetDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    targetDates.add(d.toISOString().slice(0, 10));
  }

  // Collect the 3 most recent field signal files to include regardless of date window
  // (field visits are infrequent — their dates are often outside the news/radio window).
  const recentFieldFiles = new Set(
    allFiles
      .filter((f) => /^signals-field-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .slice(-3),
  );

  // Collect the 3 most recent PBO signal files (municipality reports may not align with date window).
  const recentPboFiles = new Set(
    allFiles
      .filter((f) => /^signals-pbo-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .slice(-3),
  );

  // Collect the most recent Naftali signal file (weekly questionnaire).
  const recentNaftaliFiles = new Set(
    allFiles
      .filter((f) => /^signals-naftali-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .slice(-1),
  );

  // Source types that use recency-based inclusion (not date-windowed)
  const RECENCY_SOURCES = { field: recentFieldFiles, pbo: recentPboFiles, naftali: recentNaftaliFiles };

  // Load matching signal files
  const loadedFiles = [];
  for (const file of allFiles.sort()) {
    // filename: signals-{type}-{date}.json
    const m = file.match(/^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) continue;
    const [, sourceType, fileDate] = m;
    const recencySet = RECENCY_SOURCES[sourceType];
    // Recency-based sources (field, pbo): include recent files regardless of date.
    // All others (news, radio, whatsapp): date-windowed.
    if (recencySet) {
      if (!recencySet.has(file)) continue;
    } else if (!targetDates.has(fileDate)) continue;
    try {
      const data = JSON.parse(readFileSync(resolve(signalsDir, file), 'utf8'));
      const offset = dateOffset(fileDate, targetDate);
      const weight = TEMPORAL_WEIGHTS[offset] ?? 0.70;
      loadedFiles.push({ file, sourceType, fileDate, weight, data });
    } catch (e) {
      console.error(`  ⚠ Could not load ${file}: ${e.message}`);
    }
  }

  if (loadedFiles.length === 0) {
    console.error(`No signal files found for ${targetDate}${days > 1 ? ` (last ${days} days)` : ''}.`);
    console.error(`Expected files like: signals/signals-news-${targetDate}.json`);
    process.exit(1);
  }

  // Merge signals with temporal weights applied
  let allSignals = [];
  let totalArticles = 0;
  const sourceFiles = [];
  const sourceTypesSeen = new Set();

  for (const { weight, data, sourceType } of loadedFiles) {
    const weighted = data.signals.map((s) => ({ ...s, temporal_weight: weight, source_type: sourceType }));
    allSignals = allSignals.concat(weighted);
    totalArticles += data.total_articles ?? 0;
    sourceFiles.push(...(data.source_files ?? []));
    sourceTypesSeen.add(sourceType);
  }

  // Deduplicate near-identical signals across files (same source team may report
  // the same observation in consecutive weekly reports). Keep the one with highest
  // temporal_weight (most recent). Key on: signal_type + source + normalised evidence.
  {
    const seen = new Map();
    for (const s of allSignals) {
      const normEvidence = (s.evidence ?? '').replace(/[^\w\u0590-\u05FF]/g, '').toLowerCase().slice(0, 80);
      const key = `${s.signal_type}|${s.article_source ?? ''}|${normEvidence}`;
      const existing = seen.get(key);
      if (!existing || (s.temporal_weight ?? 1) > (existing.temporal_weight ?? 1)) {
        seen.set(key, s);
      }
    }
    const beforeCount = allSignals.length;
    allSignals = [...seen.values()];
    if (allSignals.length < beforeCount) {
      console.error(`  Deduped: ${beforeCount} → ${allSignals.length} signals (${beforeCount - allSignals.length} duplicates removed)`);
    }
  }

  const contentKind = sourceTypesSeen.size > 1 ? 'mixed'
    : sourceTypesSeen.has('radio') ? 'audio'
    : 'news';

  console.error(`\nResilience Assessment (${contentKind})`);
  console.error(`===================`);
  console.error(`Date:     ${targetDate}${days > 1 ? ` (last ${days} days)` : ''}`);
  console.error(`Sources:  ${loadedFiles.map((f) => `${f.sourceType}@${f.fileDate}(w=${f.weight})`).join(', ')}`);
  console.error(`Signals:  ${allSignals.length} total  Articles: ${totalArticles}\n`);

  const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'assess-signals' });

  // Score full (all signals combined)
  const scoredFull = scoreComponents(allSignals, { totalArticles });

  // Score per source type
  const scoreBySource = {};
  for (const sourceType of sourceTypesSeen) {
    const sourceSigs = allSignals.filter((s) => s.source_type === sourceType);
    const sourceArticles = loadedFiles
      .filter((f) => f.sourceType === sourceType)
      .reduce((sum, f) => sum + (f.data.total_articles ?? 0), 0);
    scoreBySource[sourceType] = scoreComponents(sourceSigs, { totalArticles: sourceArticles });
  }

  // Print per-component scores
  console.error(`  → ${allSignals.length} total behavioral signals\n`);
  for (const [id, c] of Object.entries(scoredFull)) {
    const cert = c.certainty != null ? ` cert=${(c.certainty * 100).toFixed(0)}%` : '';
    console.error(`  → ${id.padEnd(28)} score=${c.score ?? 'n/a'} conf=${c.confidence}${cert} (${c.signal_count} signals)`);
  }

  // Load prior reports for narrative context
  const priorReports = loadPriorReports(targetDate);
  if (priorReports.length > 0) {
    console.error(`\nPrior context: ${priorReports.map((r) => r.date).join(', ')}`);
  }

  // Narrate once (full combined)
  const assessment = await generateNarratives(scoredFull, allSignals, targetDate, totalArticles, {
    onUsage,
    priorReports,
    contentKind,
  });

  // Write extended report
  const now = new Date();
  const timeSuffix = now.toTimeString().slice(0, 5).replace(':', '');
  const outputBase = getArg('--output')?.replace(/\.(md|json)$/, '')
    ?? resolve('reports', `resilience-report-${targetDate}-${timeSuffix}`);

  writeReport(assessment, allSignals, [...new Set(sourceFiles)], outputBase, { scoreBySource });

  console.error(`\n=== Resilience Components ===`);
  for (const comp of assessment.components ?? []) {
    console.error(`  ${comp.component_id.padEnd(28)} (${comp.confidence}, ${comp.signal_count ?? 0} signals)`);
  }

  printSummary();
  console.error(`\nReports written:`);
  console.error(`  ${outputBase}.md`);
  console.error(`  ${outputBase}.json`);

  const { totalCostUsd, usageLog } = getTotal();
  appendCostLog({ script: 'assess-signals', date: targetDate, totalCostUsd, usageLog, articles: totalArticles });
}

run().catch((err) => {
  console.error('assess-signals failed:', err.message);
  process.exit(1);
});
