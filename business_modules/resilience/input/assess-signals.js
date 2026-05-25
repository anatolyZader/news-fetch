#!/usr/bin/env node
/**
 * Stage-2 CLI: load pre-extracted signal files, score per-source + full, narrate once, write report.
 *
 * Usage:
 *   node assess-signals.js --date YYYY-MM-DD [--days N] [--scope national|north] [--output <path-without-ext>]
 *
 * All sources—including field, PBO, and Naftali—may only load bundles whose basename date `YYYY-MM-DD` is:
 * - on or before `--date` (no forward leakage from later calendar days when replaying history), and
 * - inside the assessment window `{ --date , --date-1 , … }` of length `--days` (default 1, max 14).
 * So `--date D --days 14` uses D through D−13. Up to `--days` bundles per channel may load within the window;
 * Naftali at most one within the window.
 *
 * Auto-discovers signals/signals-{type}-{date}.json (root), field signals under
 * business_modules/visits/data/signals/, and social OSINT under
 * business_modules/social_media/data/ for the requested date window.
 * Temporal weights: T=1.0, T-1=0.85, T-2=0.70, then geometric decay (floor 0.50).
 */

import 'dotenv/config';
import { resolve, dirname } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

import { overallScore, scoreComponents } from '../domain/services/behaviorSignals.js';
import {
  filterSignalsForScope,
  normalizeReportScope,
  reportScopeMetadata,
} from '../domain/services/regionSignalFilter.js';
import { generateNarratives } from '../infrastructure/claudeEvaluator.js';
import { writeReport } from '../infrastructure/reportWriter.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import {
  crossSourceDedupSemantic,
  loadHistoricalScores,
  loadHistoricalSignalDays,
  enrichWithDeltaChannel,
} from './assessSignalsHelpers.js';
import { summarizeGeoCoverage, summarizeGeoQuality } from '../../../cross-cut-modules/geo/signalGeoSummary.js';
import { createGeoWiring } from '../../../cross-cut-modules/geo/createGeoWiring.js';
import { attachGeoToSignals } from '../../../cross-cut-modules/geo/attachGeoToSignals.js';
import { buildReferenceNameIndex } from '../../../cross-cut-modules/geo/referenceNameIndex.js';
import {
  buildAssessmentMethodology,
  buildScoringModelManifest,
  formatScopeDecisionLogLine,
  formatSubgroupCoverageLogLine,
} from '../domain/services/assessmentMethodology.js';
import { computeDataVoidIndex } from '../domain/services/dataVoidIndex.js';
import { countOovCapturesForDate } from '../domain/services/oovCapture.js';
import {
  annotateSignalsEpistemics,
  partitionMacroSignals,
} from '../domain/services/evidenceEligibility.js';
import { proposeComponentTuningFromReportFiles } from '../tuning/domain/componentTuningProposal.js';
import {
  summarizeStageEvents,
  readCostLogStagesForDate,
} from '../domain/services/pipelineStageTelemetry.js';
import { createValidationCollectionService } from '../validation/app/validationCollectionService.js';

/** @param {number} dayOffset days before --date (0 = target day) */
export function temporalWeightForOffset(dayOffset) {
  if (dayOffset <= 0) return 1.00;
  if (dayOffset === 1) return 0.85;
  if (dayOffset === 2) return 0.70;
  const decay = 0.70 * Math.pow(0.70 / 0.85, dayOffset - 2);
  return Math.max(0.50, decay);
}

const MAX_ASSESSMENT_DAYS = 14;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GEO_ATTACH_SOURCE_TYPES = new Set(['news', 'radio']);

function signalGeoMergeKey(s) {
  return `${s?.source_type ?? ''}|${s?.signal_type ?? ''}|${s?.evidence ?? ''}|${s?.article_url ?? s?.article_index ?? ''}`;
}

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
  const days = Math.min(MAX_ASSESSMENT_DAYS, Math.max(1, parseInt(getArg('--days') ?? '1', 10)));
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
  const socialSignalsDir = resolve('business_modules', 'social_media', 'data');

  const signalsRootExists = existsSync(signalsDir);
  const fieldSignalsRootExists = existsSync(fieldSignalsDir);
  const socialSignalsRootExists = existsSync(socialSignalsDir);

  if (!signalsRootExists && !fieldSignalsRootExists && !socialSignalsRootExists) {
    console.error('No signals directories found. Run extract-signals.js first.');
    process.exit(1);
  }

  const rootFiles = signalsRootExists
    ? readdirSync(signalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'))
    : [];

  const fieldDirFiles = fieldSignalsRootExists
    ? readdirSync(fieldSignalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'))
    : [];

  const socialDirFiles = socialSignalsRootExists
    ? readdirSync(socialSignalsDir).filter((f) => f.startsWith('signals-social-') && f.endsWith('.json'))
    : [];

  // Build date set to include
  const targetDates = new Set();
  const base = new Date(targetDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    targetDates.add(d.toISOString().slice(0, 10));
  }

  const bundleCap = days;

  const recentFieldFiles = signalBundlesInAssessmentWindow(
    fieldDirFiles.sort(),
    /^signals-field-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    bundleCap,
  );

  const recentPboFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-pbo-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    bundleCap,
  );

  const recentPboRegionalFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-pbo_regional-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    bundleCap,
  );

  const recentNaftaliFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-naftali-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    1,
  );

  // Cap every channel at `--days` bundles per assessment window (symmetric recency).
  const recentNewsFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-news-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    bundleCap,
  );
  const recentRadioFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-radio-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    bundleCap,
  );
  const recentWhatsappFiles = signalBundlesInAssessmentWindow(
    rootFiles.sort(),
    /^signals-whatsapp-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    bundleCap,
  );
  const recentSocialFiles = signalBundlesInAssessmentWindow(
    socialDirFiles.sort(),
    /^signals-social-(\d{4}-\d{2}-\d{2})\.json$/,
    targetDate,
    targetDates,
    bundleCap,
  );

  // Same calendar window + bundle-count cap for every source.
  const RECENCY_SOURCES = {
    field: recentFieldFiles,
    pbo: recentPboFiles,
    pbo_regional: recentPboRegionalFiles,
    naftali: recentNaftaliFiles,
    news: recentNewsFiles,
    radio: recentRadioFiles,
    whatsapp: recentWhatsappFiles,
    social: recentSocialFiles,
  };

  // Load pipeline config to check which sources are enabled
  const pipelineConfigPath = resolve('pipeline-config.json');
  let enabledSources = null; // null = all enabled (no config file)
  let pipelineConfig = null;
  if (existsSync(pipelineConfigPath)) {
    try {
      const cfg = JSON.parse(readFileSync(pipelineConfigPath, 'utf8'));
      pipelineConfig = cfg;
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

  // Load matching signal files (field JSON under visits; social OSINT under social_media/data)
  const loadedFiles = [];

  function tryLoadSignalFile(file, baseDir) {
    const m = file.match(/^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) return;
    const [, sourceType, fileDate] = m;
    if (fileDate > targetDate || !targetDates.has(fileDate)) return;
    // pbo_regional has no pipeline-config toggle — always load when bundles exist
    if (enabledSources && !enabledSources.has(sourceType) && sourceType !== 'pbo_regional') return;
    const recencySet = RECENCY_SOURCES[sourceType];
    if (recencySet && !recencySet.has(file)) return;
    try {
      const data = JSON.parse(readFileSync(resolve(baseDir, file), 'utf8'));
      const offset = dateOffset(fileDate, targetDate);
      const weight = temporalWeightForOffset(offset);
      loadedFiles.push({ file, sourceType, fileDate, weight, data });
    } catch (e) {
      console.error(`  ⚠ Could not load ${file}: ${e.message}`);
    }
  }

  for (const file of rootFiles.sort()) {
    const m = file.match(/^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) continue;
    if (m[1] === 'field' || m[1] === 'social') continue;
    tryLoadSignalFile(file, signalsDir);
  }

  for (const file of fieldDirFiles.sort()) {
    const m = file.match(/^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m || m[1] !== 'field') continue;
    tryLoadSignalFile(file, fieldSignalsDir);
  }

  for (const file of socialDirFiles.sort()) {
    tryLoadSignalFile(file, socialSignalsDir);
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
    const weighted = (data.signals ?? []).map((s) => ({
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

  // Within-source dedup: same source team reporting the same observation across
  // consecutive bundles. Keep highest temporal_weight (most recent).
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
      console.error(`  Within-source dedup: ${beforeCount} → ${allSignals.length} (${beforeCount - allSignals.length} duplicates removed)`);
    }
  }

  // Cross-source dedup (E7): collapse the same primary quote republished by
  // multiple outlets into one signal so coverage_ratio doesn't inflate.
  {
    const beforeCount = allSignals.length;
    allSignals = await crossSourceDedupSemantic(allSignals);
    if (allSignals.length < beforeCount) {
      console.error(`  Cross-source merged: ${beforeCount} → ${allSignals.length} (${beforeCount - allSignals.length} cross-outlet duplicates collapsed)`);
    }
  }

  const contentKind = sourceTypesSeen.size > 1 ? 'mixed'
    : sourceTypesSeen.has('radio') ? 'audio'
    : 'news';

  if (allSignals.some((s) => GEO_ATTACH_SOURCE_TYPES.has(s?.source_type))) {
    const { geoEnrichmentPort } = createGeoWiring({
      rootDir: REPO_ROOT,
      unknownSourceType: 'assess-signals',
    });
    const nameIndex = buildReferenceNameIndex(REPO_ROOT);
    const needGeo = allSignals.filter(
      (s) => GEO_ATTACH_SOURCE_TYPES.has(s?.source_type) && !(s && 'geo' in s && s.geo != null),
    );
    if (needGeo.length > 0) {
      const byType = new Map();
      for (const st of GEO_ATTACH_SOURCE_TYPES) {
        const subset = needGeo.filter((s) => s.source_type === st);
        if (!subset.length) continue;
        const { signals: enriched, attached, resolved, unknown } = attachGeoToSignals(
          subset,
          geoEnrichmentPort,
          { sourceType: st, nameIndex },
        );
        byType.set(st, { enriched, attached, resolved, unknown });
      }
      const merged = new Map();
      for (const { enriched } of byType.values()) {
        for (const s of enriched) merged.set(signalGeoMergeKey(s), s);
      }
      allSignals = allSignals.map((s) => merged.get(signalGeoMergeKey(s)) ?? s);
      const totals = [...byType.values()].reduce(
        (acc, v) => ({
          attached: acc.attached + v.attached,
          resolved: acc.resolved + v.resolved,
          unknown: acc.unknown + v.unknown,
        }),
        { attached: 0, resolved: 0, unknown: 0 },
      );
      console.error(
        `  → Geo attach (news/radio): ${totals.attached} signals, ${totals.resolved} resolved, ${totals.unknown} unknown`,
      );
    }
  }

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

  // Load 14-day per-component score history once for delta-channel enrichment.
  const historicalScores = loadHistoricalScores(targetDate, 'reports', 14, reportScopeId);
  if (Object.keys(historicalScores).length > 0) {
    console.error(`  Loaded historical score series for ${Object.keys(historicalScores).length} components`);
  }

  allSignals = filterSignalsForScope(allSignals, reportScopeId);
  allSignals = annotateSignalsEpistemics(allSignals, { reportScope: reportScopeId });
  const { metricsSignals, macroSignals } = partitionMacroSignals(allSignals, reportScopeId);
  const signalsForScoring = reportScopeId === 'north' ? metricsSignals : allSignals;
  if (reportScopeId === 'north' && macroSignals.length > 0) {
    console.error(`  → Epistemic partition: ${metricsSignals.length} metrics-eligible, ${macroSignals.length} macro/context-only`);
  }
  if (reportScopeId !== 'national') {
    console.error(`  → Scope filter (${reportScope.label}): ${allSignals.length}/${nationalSignals.length} signals retained`);
  }

  const scopeMethodologyPreview = buildAssessmentMethodology({
    signals: allSignals,
    reportScopeId,
  });
  const scopeLogLine = formatScopeDecisionLogLine(scopeMethodologyPreview);
  if (scopeLogLine) console.error(scopeLogLine);

  if (signalsForScoring.length === 0 && macroSignals.length === 0) {
    console.error(`No signal files contained ${reportScope.label} evidence for ${targetDate}${days > 1 ? ` (last ${days} days)` : ''}.`);
    process.exit(1);
  }

  const scopedArticleKeys = new Set(
    signalsForScoring
      .map((s) => s.article_url || (s.article_index ?? null))
      .filter((v) => v != null),
  );
  const scopedTotalArticles = reportScopeId === 'national'
    ? totalArticles
    : Math.max(scopedArticleKeys.size, 1);
  const scopedSourceTypesSeen = new Set(signalsForScoring.map((s) => s.source_type).filter(Boolean));

  // Score full (metrics-eligible signals for the selected scope)
  let scoredFull = scoreComponents(signalsForScoring, {
    totalArticles: scopedTotalArticles,
    mediaSignals: allSignals,
  });
  scoredFull = enrichWithDeltaChannel(scoredFull, historicalScores, { scopeId: reportScopeId });

  // Score per source type
  const scoreBySource = {};
  for (const sourceType of scopedSourceTypesSeen) {
    const sourceSigs = signalsForScoring.filter((s) => s.source_type === sourceType);
    const sourceArticles = reportScopeId === 'national'
      ? loadedFiles
        .filter((f) => f.sourceType === sourceType)
        .reduce((sum, f) => sum + (f.data.total_articles ?? 0), 0)
      : Math.max(new Set(sourceSigs.map((s) => s.article_url || (s.article_index ?? null)).filter((v) => v != null)).size, 1);
    scoreBySource[sourceType] = scoreComponents(sourceSigs, { totalArticles: sourceArticles });
  }

  // Print per-component scores
  console.error(`  → ${signalsForScoring.length} metrics-eligible behavioral signals\n`);
  if (allSignals.some((s) => s && 'geo' in s)) {
    const geoCov = summarizeGeoCoverage(allSignals);
    const geoQual = summarizeGeoQuality(allSignals);
    console.error(
      `  → Geo on signals: ${geoCov.resolved} resolved, ${geoCov.unknown} unknown (${geoCov.pctResolved}% of ${geoCov.withGeoField} geo-tagged)`,
    );
    console.error(
      `  → Geo quality: metrics-safe ${geoQual.pctUsableForMetrics}% of resolved, requiresReview ${geoQual.pctRequiresReview}%\n`,
    );
  }
  for (const [id, c] of Object.entries(scoredFull)) {
    const cert = c.certainty != null ? ` cert=${(c.certainty * 100).toFixed(0)}%` : '';
    console.error(`  → ${id.padEnd(28)} score=${c.score ?? 'n/a'} conf=${c.confidence}${cert} (${c.signal_count} signals)`);
  }

  // Load prior reports for narrative context
  const priorReports = loadPriorReports(targetDate);
  if (priorReports.length > 0) {
    console.error(`\nPrior context: ${priorReports.map((r) => r.date).join(', ')}`);
  }

  const historicalSignalDays = loadHistoricalSignalDays(targetDate, 'reports', 7, reportScopeId);
  const dataVoid = computeDataVoidIndex(allSignals, historicalSignalDays, { reportScope: reportScopeId });
  const oovCaptureCount = countOovCapturesForDate(targetDate);

  // Narrate once (full combined)
  const assessment = await generateNarratives(scoredFull, signalsForScoring, targetDate, scopedTotalArticles, {
    onUsage,
    priorReports,
    contentKind,
    sourceTypes: scopedSourceTypesSeen,
    reportScope,
    comparisonScores: reportScopeId === 'north' ? nationalScored : null,
    comparisonLabel: reportScopeId === 'north' ? 'national' : null,
    macroSignals,
    allScopedSignals: allSignals,
    dataVoid,
    oovCaptureCount,
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

  const { totalCostUsd, usageLog, stageEvents } = getTotal();
  const assessStages = summarizeStageEvents(stageEvents);
  const costLogStages = readCostLogStagesForDate(targetDate, {
    scripts: ['extract-signals', 'assess-signals'],
  });
  const extractionTelemetry = {
    assess: assessStages,
    extract: costLogStages['extract-signals'] ?? null,
    assess_log: costLogStages['assess-signals'] ?? null,
  };

  const tuningProposal = proposeComponentTuningFromReportFiles(resolve('reports'), { minReports: 10 });
  assessment.methodology = buildAssessmentMethodology({
    signals: allSignals,
    reportScopeId,
    scoringModelManifest: buildScoringModelManifest(),
    tuningProposal,
    extractionTelemetry,
  });
  const subgroupLogLine = formatSubgroupCoverageLogLine(assessment.methodology);
  if (subgroupLogLine) console.error(subgroupLogLine);

  const reportJsonPath = `${outputBase}.json`;
  const signalPaths = loadedFiles.map(({ file, sourceType }) => {
    if (sourceType === 'field') return resolve(fieldSignalsDir, file);
    if (sourceType === 'social') return resolve(socialSignalsDir, file);
    return resolve(signalsDir, file);
  });

  try {
    const validationSvc = createValidationCollectionService();
    const validationResult = validationSvc.collectAfterAssessment({
      assessment,
      signals: allSignals,
      reportJsonPath,
      signalPaths,
      pipelineConfig,
      tuningProposal,
    });
    if (!validationResult.skipped) {
      console.error(
        `\nValidation collection (${validationResult.operationalPhase}): ` +
        `${validationResult.reviewItemCount} review item(s) → ${validationResult.recordPath}`,
      );
      if (validationResult.elevationAdvisory) {
        console.error(`  ⚠ ${validationResult.elevationAdvisory.message}`);
      }
    }
  } catch (err) {
    console.error(`  ⚠ Validation collection failed (report still written): ${err.message}`);
  }

  writeReport(assessment, allSignals, [...new Set(sourceFiles)], outputBase, { scoreBySource });

  console.error(`\n=== Resilience Components ===`);
  for (const comp of assessment.components ?? []) {
    console.error(`  ${comp.component_id.padEnd(28)} (${comp.confidence}, ${comp.signal_count ?? 0} signals)`);
  }

  printSummary();
  console.error(`\nReports written:`);
  console.error(`  ${outputBase}.md (analyst/full scores)`);
  console.error(`  ${outputBase}-brief.md (operator brief, no /10)`);
  console.error(`  ${outputBase}.json`);

  appendCostLog({ script: 'assess-signals', date: targetDate, totalCostUsd, usageLog, stageEvents, articles: totalArticles });
}

run().catch((err) => {
  console.error('assess-signals failed:', err.message);
  process.exit(1);
});
