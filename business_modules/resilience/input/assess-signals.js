#!/usr/bin/env node
/**
 * Stage-2 CLI: load pre-extracted signal files, score per-source + full, narrate once, write report.
 *
 * Usage:
 *   node assess-signals.js --date YYYY-MM-DD [--days 1|3] [--scope national|north] [--output <path-without-ext>]
 *
 * All sources—including field, PBO, and Naftali—may only load bundles whose basename date `YYYY-MM-DD` is:
 * - on or before `--date` (no forward leakage from later calendar days when replaying history), and
 * - inside the assessment window `{ --date , --date-1 , … }` of length `--days` (default 1, max 3).
 * So `--date D --days 3` uses only D, D−1, D−2. Up to three field bundles and three PBO bundles within that window may load
 * when multiple dated files exist; Naftali at most one within the window.
 *
 * Auto-discovers signals/signals-{type}-{date}.json (root) and field signals under
 * business_modules/visits/data/signals/ for the requested date window.
 * Temporal weights: today=1.0, T-1=0.85, T-2=0.70
 */

import 'dotenv/config';
import { resolve } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

import { overallScore, scoreComponents } from '../domain/services/behaviorSignals.js';
import {
  filterSignalsForScope,
  normalizeReportScope,
  reportScopeMetadata,
} from '../domain/services/regionSignalFilter.js';
import { generateNarratives } from '../infrastructure/claudeEvaluator.js';
import { writeReport } from '../infrastructure/reportWriter.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';

const TEMPORAL_WEIGHTS = { 0: 1.00, 1: 0.85, 2: 0.70 };

/**
 * basename-dated bundles only inside { targetDates } ∩ { ≤ targetDate }.
 * `retainLast` keeps up to N newest-by-filename-date within that set (deterministic replay).
 */
function signalBundlesInAssessmentWindow(sortedFilenames, regex, targetDate, targetDates, retainLast) {
  const inWindow = [];
  for (const f of sortedFilenames) {
    const m = f.match(regex);
    if (!m) continue;
    const fd = m[1];
    if (fd > targetDate || !targetDates.has(fd)) continue;
    inWindow.push(f);
  }
  const pick = retainLast != null ? inWindow.slice(-retainLast) : inWindow;
  return new Set(pick);
}

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
  const reportScopeId = normalizeReportScope(getArg('--scope') ?? 'national');
  const reportScope = reportScopeMetadata(reportScopeId);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  checkDailyBudget();

  // Discover signal files for the requested date window
  const signalsDir = resolve('signals');
  const fieldSignalsDir = resolve('business_modules', 'visits', 'data', 'signals');

  const signalsRootExists = existsSync(signalsDir);
  const fieldSignalsRootExists = existsSync(fieldSignalsDir);

  if (!signalsRootExists && !fieldSignalsRootExists) {
    console.error('No signals directories found. Run extract-signals.js first.');
    process.exit(1);
  }

  const rootFiles = signalsRootExists
    ? readdirSync(signalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'))
    : [];

  const fieldDirFiles = fieldSignalsRootExists
    ? readdirSync(fieldSignalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'))
    : [];

  // Build date set to include
  const targetDates = new Set();
  const base = new Date(targetDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    targetDates.add(d.toISOString().slice(0, 10));
  }

  const recentFieldFiles = signalBundlesInAssessmentWindow(
    fieldDirFiles.sort(),
    /^signals-field-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    3,
  );

  const recentPboFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-pbo-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    3,
  );

  const recentPboRegionalFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-pbo_regional-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    3,
  );

  const recentNaftaliFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-naftali-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    1,
  );

  // Field / PBO / regional PBO / Naftali: same calendar window + no dates after `--date` as news/radio/etc.
  const RECENCY_SOURCES = {
    field: recentFieldFiles,
    pbo: recentPboFiles,
    pbo_regional: recentPboRegionalFiles,
    naftali: recentNaftaliFiles,
  };

  // Load pipeline config to check which sources are enabled
  const pipelineConfigPath = resolve('pipeline-config.json');
  let enabledSources = null; // null = all enabled (no config file)
  if (existsSync(pipelineConfigPath)) {
    try {
      const cfg = JSON.parse(readFileSync(pipelineConfigPath, 'utf8'));
      enabledSources = new Set(
        Object.entries(cfg.sources || {})
          .filter(([, v]) => v.enabled !== false)
          .map(([k]) => k),
      );
      const disabled = Object.entries(cfg.sources || {})
        .filter(([, v]) => v.enabled === false)
        .map(([k]) => k);
      if (disabled.length) console.log(`  ℹ Disabled sources (pipeline-config.json): ${disabled.join(', ')}`);
    } catch (e) {
      console.error(`  ⚠ Could not read pipeline-config.json: ${e.message}`);
    }
  }

  // Load matching signal files (field JSON lives under visits module; other sources in signals/)
  const loadedFiles = [];

  function tryLoadSignalFile(file, baseDir) {
    const m = file.match(/^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) return;
    const [, sourceType, fileDate] = m;
    if (fileDate > targetDate || !targetDates.has(fileDate)) return;
    if (enabledSources && !enabledSources.has(sourceType)) return;
    const recencySet = RECENCY_SOURCES[sourceType];
    if (recencySet && !recencySet.has(file)) return;
    try {
      const data = JSON.parse(readFileSync(resolve(baseDir, file), 'utf8'));
      const offset = dateOffset(fileDate, targetDate);
      const weight = TEMPORAL_WEIGHTS[offset] ?? 0.70;
      loadedFiles.push({ file, sourceType, fileDate, weight, data });
    } catch (e) {
      console.error(`  ⚠ Could not load ${file}: ${e.message}`);
    }
  }

  for (const file of rootFiles.sort()) {
    const m = file.match(/^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) continue;
    if (m[1] === 'field') continue;
    tryLoadSignalFile(file, signalsDir);
  }

  for (const file of fieldDirFiles.sort()) {
    const m = file.match(/^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m || m[1] !== 'field') continue;
    tryLoadSignalFile(file, fieldSignalsDir);
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

  for (const { weight, data, sourceType, fileDate } of loadedFiles) {
    const weighted = data.signals.map((s) => ({
      ...s,
      temporal_weight: weight,
      source_type: sourceType,
      signal_file_date: fileDate,
    }));
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
  console.error(`Scope:    ${reportScope.label}`);
  console.error(`Sources:  ${loadedFiles.map((f) => `${f.sourceType}@${f.fileDate}(w=${f.weight})`).join(', ')}`);
  console.error(`Signals:  ${allSignals.length} total  Articles: ${totalArticles}\n`);

  const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'assess-signals' });

  const nationalSignals = allSignals;
  const nationalTotalArticles = totalArticles;
  const nationalScored = scoreComponents(nationalSignals, { totalArticles: nationalTotalArticles });

  allSignals = filterSignalsForScope(allSignals, reportScopeId);
  if (reportScopeId !== 'national') {
    console.error(`  → Scope filter (${reportScope.label}): ${allSignals.length}/${nationalSignals.length} signals retained`);
  }

  if (allSignals.length === 0) {
    console.error(`No signal files contained ${reportScope.label} evidence for ${targetDate}${days > 1 ? ` (last ${days} days)` : ''}.`);
    process.exit(1);
  }

  const scopedArticleKeys = new Set(
    allSignals
      .map((s) => s.article_url || (s.article_index ?? null))
      .filter((v) => v != null),
  );
  const scopedTotalArticles = reportScopeId === 'national'
    ? totalArticles
    : Math.max(scopedArticleKeys.size, 1);
  const scopedSourceTypesSeen = new Set(allSignals.map((s) => s.source_type).filter(Boolean));

  // Score full (all signals combined for the selected scope)
  const scoredFull = scoreComponents(allSignals, { totalArticles: scopedTotalArticles });

  // Score per source type
  const scoreBySource = {};
  for (const sourceType of scopedSourceTypesSeen) {
    const sourceSigs = allSignals.filter((s) => s.source_type === sourceType);
    const sourceArticles = reportScopeId === 'national'
      ? loadedFiles
        .filter((f) => f.sourceType === sourceType)
        .reduce((sum, f) => sum + (f.data.total_articles ?? 0), 0)
      : Math.max(new Set(sourceSigs.map((s) => s.article_url || (s.article_index ?? null)).filter((v) => v != null)).size, 1);
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
  const assessment = await generateNarratives(scoredFull, allSignals, targetDate, scopedTotalArticles, {
    onUsage,
    priorReports,
    contentKind,
    sourceTypes: scopedSourceTypesSeen,
    reportScope,
    comparisonScores: reportScopeId === 'north' ? nationalScored : null,
    comparisonLabel: reportScopeId === 'north' ? 'national' : null,
  });

  // Write extended report
  const now = new Date();
  const timeSuffix = now.toTimeString().slice(0, 5).replace(':', '');
  const outputPrefix = reportScopeId === 'north' ? 'resilience-report-north' : 'resilience-report';
  const outputBase = getArg('--output')?.replace(/\.(md|json)$/, '')
    ?? resolve('reports', `${outputPrefix}-${targetDate}-${timeSuffix}`);

  if (reportScopeId === 'north') {
    assessment.national_comparison = {
      overall_resilience_score: overallScore(nationalScored),
      total_signals: nationalSignals.length,
    };
  }

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
