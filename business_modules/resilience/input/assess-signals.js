#!/usr/bin/env node
/**
 * Stage-2 CLI: load pre-extracted signal files, score per-source + full, narrate once, write report.
 *
 * Usage:
 *   node assess-signals.js --date YYYY-MM-DD [--days N] [--scope national|north|south|jerusalem|dan|haifa] [--output <path-without-ext>]
 *
 * All sources—including field, PBO, and Naftali—may only load bundles whose basename date `YYYY-MM-DD` is:
 * - on or before `--date` (no forward leakage from later calendar days when replaying history), and
 * - inside the assessment window `{ --date , --date-1 , … }` of length `--days` (default 1, max 14).
 * So `--date D --days 14` uses D through D−13. Up to `--days` bundles per channel may load within the window;
 * Naftali at most one within the window.
 *
 * Auto-discovers business_modules/signals_extraction/data/signals/signals-{type}-{date}.json,
 * field signals under business_modules/visits/data/signals/, and social OSINT under
 * business_modules/social_media/data/ for the requested date window.
 * Temporal weights: T=1, T-1=0.85, T-2=0.70, then geometric decay (floor 0.50).
 */

import 'dotenv/config';
import { bootstrapDefaultStateStore } from '../../../cross-cut-modules/persistence/bootstrapStateStore.js';
import { EVENT_TYPES, publishDomainEvent } from '../../../cross-cut-modules/messaging/index.js';

bootstrapDefaultStateStore();

import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { overallScore, scoreComponents } from '../domain/services/behaviorSignals.js';
import { scopeAndPartitionSignals } from '../app/assessmentPipeline.js';
import { buildComparisonContext } from '../domain/services/sourceMixIndex.js';
import { isRegionalReportScope, reportFilePrefix } from '../../../cross-cut-modules/geo/reportScopeIds.js';
import { ISRAEL_NATIONAL_DISTRICT_ID } from '../../../cross-cut-modules/geo/israelDistricts.js';
import { generateNarratives } from '../infrastructure/claudeEvaluator.js';
import { writeReport } from '../infrastructure/reportWriter.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import {
  crossSourceDedupClustered,
  loadHistoricalScores,
  loadHistoricalSignalDays,
  parseAssessCliArgs,
  loadPipelineConfig,
  mergeLoadedSignalFiles,
  dedupWithinSource,
} from './assessSignalsHelpers.js';
import { summarizeGeoCoverage, summarizeGeoQuality } from '../../../cross-cut-modules/geo/signalGeoSummary.js';
import { enrichSignalsWithGeo } from '../../../cross-cut-modules/geo/enrichSignalsWithGeo.js';
import {
  buildAssessmentMethodology,
  buildScoringModelManifest,
  formatScopeDecisionLogLine,
  formatSubgroupCoverageLogLine,
} from '../domain/services/assessmentMethodology.js';
import { computeDataVoidIndex, attachEpistemicToAssessment } from '../domain/services/dataVoidIndex.js';
import { runScoringPipeline } from '../app/scoringPipelinePrep.js';
import { detectSemanticPatterns } from '../domain/services/patternDetection/semanticPatternAlerts.js';
import { buildOperatorRecommendations } from '../domain/services/patternDetection/operatorRecommendations.js';
import { attachDecisionBrief } from '../app/attachDecisionBrief.js';
import { prepareScoringSignals } from '../app/prepareScoringSignals.js';
import { salienceContextFromDataVoid } from '../domain/services/highSalienceBypass.js';
import { countOovCapturesForDate } from '../domain/services/oovCapture.js';
import {
  getSocialQuarantineDecision,
} from '../domain/services/socialQuarantineOverrides.js';
import { tryOpenValidationStore } from '../app/socialQuarantineWiring.js';
import { proposeComponentTuningFromReportFiles } from '../tuning/domain/componentTuningProposal.js';
import {
  summarizeStageEvents,
  readCostLogStagesForDate,
} from '../domain/services/pipelineStageTelemetry.js';
import createValidationCollectionService from '../validation/app/validationCollectionService.js';
import { summarizeValidationMaturity } from '../validation/domain/validationStatus.js';
import { loadConnectivityProbeSignals, loadProbeRecordsForDate } from '../infrastructure/adapters/connectivityProbeFileAdapter.js';
import { enrichProbeSignalsInList } from '../domain/services/probeCorroborationPolicy.js';
import { createDefaultPboReportReviewService } from '../../pbo_report_review/index.js';
import { createSourceArchive } from '../../../db/source_archive/createSourceArchive.js';
import { archiveProbeRecords } from '../../../db/source_archive/archiveProbeRecords.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { createSignalBundlePort } from './createSignalBundlePort.js';
import { defaultClosedSignalsDir } from '../../signals_extraction/infrastructure/signalsDataPaths.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const SIGNAL_DIRS = {
  signalsDir: defaultClosedSignalsDir(),
  fieldSignalsDir: resolve('business_modules', 'visits', 'data', 'signals'),
  socialSignalsDir: resolve('business_modules', 'social_media', 'data'),
};

function formatDaysSuffix(days) {
  return days > 1 ? ` (last ${days} days)` : '';
}

function contentKindFromSourceTypes(sourceTypesSeen) {
  if (sourceTypesSeen.size > 1) return 'mixed';
  if (sourceTypesSeen.has('radio')) return 'audio';
  return 'news';
}

function loadPriorReports(targetDate, n = 2) {
  const dir = resolve('daily_reports');
  if (!existsSync(dir)) return [];
  const allFiles = readdirSync(dir);
  const prior = [];
  const d = new Date(targetDate);
  for (let i = 1; i <= n; i++) {
    const p = new Date(d);
    p.setDate(d.getDate() - i);
    const pd = p.toISOString().slice(0, 10);
    const match = [...allFiles.filter((f) => f.startsWith(`resilience-report-${pd}`) && f.endsWith('.json'))]
      .sort((a, b) => a.localeCompare(b))
      .at(-1);
    if (match) {
      try {
        const json = JSON.parse(readFileSync(resolve(dir, match), 'utf8'));
        prior.unshift(json.assessment);
      } catch { /* ignore */ }
    }
  }
  return prior;
}

function assertApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }
}

function exitIfNoSignalBundles(bundlePort, discovery, useObservations) {
  if (bundlePort.hasAnySource(discovery)) return;
  if (useObservations) {
    console.error('No observation bundles found. Run: npm run extract-observations -- ...');
  } else {
    console.error('No signals directories found. Run extract-signals.js first.');
  }
  process.exit(1);
}

function exitIfNoLoadedSignalFiles(loadedFiles, useObservations, targetDate, days) {
  if (loadedFiles.length > 0) return;
  const suffix = formatDaysSuffix(days);
  if (useObservations) {
    console.error(`No mapped observation bundles for ${targetDate}${suffix}.`);
    console.error('Ensure observations have suggested_catalog_types matching SIGNAL_CATALOG.');
  } else {
    console.error(`No signal files found for ${targetDate}${suffix}.`);
    console.error(`Expected files like: signals/signals-news-${targetDate}.json`);
  }
  process.exit(1);
}

function mergeConnectivityProbeSignals(allSignals, sourceTypesSeen, targetDate) {
  const probeSignals = loadConnectivityProbeSignals(targetDate, 'national');
  if (probeSignals.length === 0) return allSignals;
  sourceTypesSeen.add('infrastructure_probe');
  console.error(`  → Connectivity probes: ${probeSignals.length} signal(s) merged`);
  return [...allSignals, ...probeSignals];
}

function archiveProbeRecordsForDate(targetDate) {
  try {
    const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
    const archive = createSourceArchive(sqlitePath);
    const records = loadProbeRecordsForDate(targetDate, 'national');
    const n = archiveProbeRecords(archive, records, targetDate);
    archive.close();
    if (n > 0) console.error(`  → ${n} probe original(s) archived`);
  } catch (err) {
    console.error(`  ⚠ Probe archive skipped: ${err.message}`);
  }
}

function createRetrievalServiceSafe() {
  try {
    const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
    return createRetrievalService({ dbPath: sqlitePath });
  } catch (err) {
    console.error(`  ⚠ Retrieval service unavailable: ${err.message}`);
    return null;
  }
}

async function dedupSignalsCrossSource(allSignals, retrievalService) {
  const beforeCrossSource = allSignals.length;
  const deduped = await crossSourceDedupClustered(allSignals, {
    storyClusterIndex: retrievalService?.storyClusterIndex ?? null,
  });
  if (deduped.length < beforeCrossSource) {
    console.error(`  Cross-source merged: ${beforeCrossSource} → ${deduped.length} (${beforeCrossSource - deduped.length} cross-outlet duplicates collapsed)`);
  }
  return deduped;
}

function enrichSignalsGeoIfNeeded(allSignals) {
  const needGeoCount = allSignals.filter((s) => !(s && 'geo' in s && s.geo != null)).length;
  if (needGeoCount === 0) return allSignals;
  const { signals: enriched, attached, resolved, unknown } = enrichSignalsWithGeo(allSignals, {
    rootDir: REPO_ROOT,
    unknownSourceType: 'assess-signals',
  });
  if (attached > 0) {
    console.error(
      `  → Geo attach (all sources): ${attached} signals, ${resolved} resolved, ${unknown} unknown`,
    );
  }
  return enriched;
}

async function loadPreparedSignals(targetDate, days, bundleOpts = {}) {
  const bundlePort = await createSignalBundlePort({
    bundleSource: bundleOpts.bundleSource ?? 'closed',
    observationsProfile: bundleOpts.observationsProfile ?? null,
    signalDirs: SIGNAL_DIRS,
  });

  const { enabledSources: configSources, pipelineConfig } = loadPipelineConfig(
    resolve('pipeline-config.json'),
  );
  const useObservations = (bundleOpts.bundleSource ?? 'closed') === 'observations';
  const enabledSources = useObservations ? null : configSources;

  const discovery = bundlePort.discoverBundles({ targetDate, days, enabledSources });

  exitIfNoSignalBundles(bundlePort, discovery, useObservations);

  const loadedFiles = bundlePort.loadBundles(discovery, { targetDate, enabledSources });

  exitIfNoLoadedSignalFiles(loadedFiles, useObservations, targetDate, days);

  let { allSignals, totalArticles, sourceFiles, sourceTypesSeen } = mergeLoadedSignalFiles(loadedFiles);
  allSignals = mergeConnectivityProbeSignals(allSignals, sourceTypesSeen, targetDate);
  archiveProbeRecordsForDate(targetDate);
  allSignals = enrichProbeSignalsInList(allSignals);
  allSignals = dedupWithinSource(allSignals);

  const retrievalService = createRetrievalServiceSafe();
  allSignals = await dedupSignalsCrossSource(allSignals, retrievalService);
  allSignals = enrichSignalsGeoIfNeeded(allSignals);

  return {
    loadedFiles,
    allSignals,
    totalArticles,
    sourceFiles,
    sourceTypesSeen,
    retrievalService,
    pipelineConfig,
    contentKind: contentKindFromSourceTypes(sourceTypesSeen),
  };
}

function logAssessmentHeader({ targetDate, days, reportScope, loadedFiles, allSignals, totalArticles, contentKind }) {
  const suffix = formatDaysSuffix(days);
  console.error(`\nResilience Assessment (${contentKind})`);
  console.error(`===================`);
  console.error(`Date:     ${targetDate}${suffix}`);
  console.error(`Scope:    ${reportScope.label}`);
  const sourceSummary = loadedFiles
    .map((f) => `${f.sourceType}@${f.fileDate}(w=${f.weight})`)
    .join(', ');
  console.error(`Sources:  ${sourceSummary}`);
  console.error(`Signals:  ${allSignals.length} total  Articles: ${totalArticles}\n`);
}

function logBuildScopedDiagnostics({
  reportScopeId,
  reportScope,
  nationalSignals,
  scopedSignals,
  metricsSignals,
  macroSignals,
  dataVoid,
  scopeLogLine,
}) {
  if (isRegionalReportScope(reportScopeId) && macroSignals.length > 0) {
    console.error(`  → Epistemic partition: ${metricsSignals.length} metrics-eligible, ${macroSignals.length} macro/context-only`);
  }
  if (reportScopeId !== ISRAEL_NATIONAL_DISTRICT_ID) {
    console.error(`  → Scope filter (${reportScope.label}): ${scopedSignals.length}/${nationalSignals.length} signals retained`);
  }
  if (dataVoid.level && dataVoid.level !== 'none') {
    console.error(`  → Data void: level=${dataVoid.level} reason=${dataVoid.reason ?? 'n/a'} digital_darkness=${dataVoid.digital_darkness}`);
  }
  if (scopeLogLine) console.error(scopeLogLine);
}

function buildScoreBySource({
  scopedSourceTypesSeen,
  signalsForScoring,
  reportScopeId,
  loadedFiles,
  salienceContext,
}) {
  const scoreBySource = {};
  for (const sourceType of scopedSourceTypesSeen) {
    const sourceSigs = signalsForScoring.filter((s) => s.source_type === sourceType);
    const sourceArticles = reportScopeId === ISRAEL_NATIONAL_DISTRICT_ID
      ? loadedFiles
        .filter((f) => f.sourceType === sourceType)
        .reduce((sum, f) => sum + (f.data.total_articles ?? 0), 0)
      : Math.max(new Set(sourceSigs.map((s) => s.article_url || (s.article_index ?? null)).filter((v) => v != null)).size, 1);
    scoreBySource[sourceType] = scoreComponents(sourceSigs, {
      totalArticles: sourceArticles,
      salienceContext,
    });
  }
  return scoreBySource;
}

async function buildScopedScoring(targetDate, days, allSignals, totalArticles, reportScopeId, reportScope, loadedFiles) {
  const nationalSignals = allSignals;
  const nationalHistoricalDays = isRegionalReportScope(reportScopeId)
    ? loadHistoricalSignalDays(targetDate, 'daily_reports', 7, ISRAEL_NATIONAL_DISTRICT_ID)
    : loadHistoricalSignalDays(targetDate, 'daily_reports', 7, reportScopeId);

  const historicalScores = loadHistoricalScores(targetDate, 'daily_reports', 14, reportScopeId);
  if (Object.keys(historicalScores).length > 0) {
    console.error(`  Loaded historical score series for ${Object.keys(historicalScores).length} components`);
  }

  const {
    scopedSignals,
    metricsSignals,
    macroSignals,
    baseSignalsForScoring,
  } = scopeAndPartitionSignals(allSignals, reportScopeId);

  const prepared = await prepareScoringSignals({
    signalsForScoring: baseSignalsForScoring,
    reportDate: targetDate,
    reportScopeId,
    reportsDir: 'daily_reports',
  });

  let signalsForScoring = prepared.signalsForScoring;
  const dataVoid = prepared.dataVoid;
  const osintChannelQuarantine = prepared.osintChannelQuarantine;
  const oovBurst = prepared.oovBurst;
  const oovScoringApplied = prepared.oovScoringApplied;
  const priorQuarantine = prepared.priorQuarantine;

  const nationalDataVoid = isRegionalReportScope(reportScopeId)
    ? computeDataVoidIndex(nationalSignals, nationalHistoricalDays, { reportScope: ISRAEL_NATIONAL_DISTRICT_ID })
    : null;

  let salienceContext = salienceContextFromDataVoid(dataVoid);
  const nationalScored = scoreComponents(nationalSignals, { totalArticles, salienceContext });

  const scopeMethodologyPreview = buildAssessmentMethodology({ signals: scopedSignals, reportScopeId });
  const scopeLogLine = formatScopeDecisionLogLine(scopeMethodologyPreview);
  logBuildScopedDiagnostics({
    reportScopeId,
    reportScope,
    nationalSignals,
    scopedSignals,
    metricsSignals,
    macroSignals,
    dataVoid,
    scopeLogLine,
  });

  if (signalsForScoring.length === 0 && macroSignals.length === 0) {
    const suffix = formatDaysSuffix(days);
    console.error(`No signal files contained ${reportScope.label} evidence for ${targetDate}${suffix}.`);
    process.exit(1);
  }

  const scopedArticleKeys = new Set(
    signalsForScoring
      .map((s) => s.article_url || (s.article_index ?? null))
      .filter((v) => v != null),
  );
  const scopedTotalArticles = reportScopeId === ISRAEL_NATIONAL_DISTRICT_ID
    ? totalArticles
    : Math.max(scopedArticleKeys.size, 1);
  const scopedSourceTypesSeen = new Set(signalsForScoring.map((s) => s.source_type).filter(Boolean));

  const validationMaturity = summarizeValidationMaturity({ rootDir: REPO_ROOT });
  const pipelineResult = runScoringPipeline({
    signalsForScoring,
    dataVoid,
    totalArticles: scopedTotalArticles,
    mediaSignals: scopedSignals,
    salienceContext,
    historicalScores,
    scopeId: reportScopeId,
    validationMaturity,
    priorQuarantine,
    reportDate: targetDate,
  });

  let scoredFull = pipelineResult.scoredFull;
  salienceContext = pipelineResult.salienceContext;
  const metricsSignalsForNarrative = pipelineResult.scoringSignals;

  const scoreBySource = buildScoreBySource({
    scopedSourceTypesSeen,
    signalsForScoring: metricsSignalsForNarrative,
    reportScopeId,
    loadedFiles,
    salienceContext,
  });

  return {
    nationalSignals,
    nationalScored,
    nationalDataVoid,
    scopedSignals,
    signalsForScoring: metricsSignalsForNarrative,
    macroSignals,
    scopedTotalArticles,
    scopedSourceTypesSeen,
    scoredFull,
    scoreBySource,
    dataVoid,
    assessmentMode: pipelineResult.assessmentMode,
    epistemicStatus: pipelineResult.epistemicStatus,
    staleDigitalScores: pipelineResult.staleDigitalScores,
    quarantinedDigital: pipelineResult.quarantinedDigital,
    validationMaturity,
    epistemicEnrichment: pipelineResult.epistemicEnrichment,
    osintChannelQuarantine,
    oovBurst,
    oovScoringApplied,
    digitalQuarantineState: pipelineResult.digitalQuarantineState,
  };
}

function logScoringResults(scopedSignals, signalsForScoring, scoredFull) {
  console.error(`  → ${signalsForScoring.length} metrics-eligible behavioral signals\n`);
  if (scopedSignals.some((s) => s && 'geo' in s)) {
    const geoCov = summarizeGeoCoverage(scopedSignals);
    const geoQual = summarizeGeoQuality(scopedSignals);
    console.error(
      `  → Geo on signals: ${geoCov.resolved} resolved, ${geoCov.unknown} unknown (${geoCov.pctResolved}% of ${geoCov.withGeoField} geo-tagged)`,
    );
    console.error(
      `  → Geo quality: metrics-safe ${geoQual.pctUsableForMetrics}% of resolved, requiresReview ${geoQual.pctRequiresReview}%\n`,
    );
  }
  for (const [id, c] of Object.entries(scoredFull)) {
    const cert = c.certainty == null ? '' : ` cert=${(c.certainty * 100).toFixed(0)}%`;
    console.error(`  → ${id.padEnd(28)} score=${c.score ?? 'n/a'} conf=${c.confidence}${cert} (${c.signal_count} signals)`);
  }
}

function resolveOutputBase(reportScopeId, targetDate, getArg) {
  const now = new Date();
  const timeSuffix = now.toTimeString().slice(0, 5).replace(':', '');
  const outputPrefix = reportFilePrefix(reportScopeId);
  const cliOutputBase = getArg('--output')?.replace(/\.(md|json)$/, '');
  return cliOutputBase ?? resolve('daily_reports', `${outputPrefix}-${targetDate}-${timeSuffix}`);
}

function buildSignalPaths(loadedFiles) {
  return loadedFiles.map(({ file, sourceType, data }) => {
    if (data?._from_observations) {
      return resolve('business_modules/signals_extraction/data', file);
    }
    if (sourceType === 'field') return resolve(SIGNAL_DIRS.fieldSignalsDir, file);
    if (sourceType === 'social') return resolve(SIGNAL_DIRS.socialSignalsDir, file);
    return resolve(SIGNAL_DIRS.signalsDir, file);
  });
}

function collectValidation(assessment, allSignals, outputBase, signalPaths, pipelineConfig, tuningProposal) {
  try {
    const validationSvc = createValidationCollectionService();
    const validationResult = validationSvc.collectAfterAssessment({
      assessment,
      signals: allSignals,
      reportJsonPath: `${outputBase}.json`,
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
}

function enrichAssessmentMetadata(assessment, { scoring, targetDate, reportScopeId, epistemicEnrichment, epistemic, scopedSignals }) {
  attachEpistemicToAssessment(assessment, epistemic);
  assessment.oov_burst = scoring.oovBurst ?? null;
  if (scoring.oovScoringApplied) assessment.oov_scoring_applied = scoring.oovScoringApplied;
  if (scoring.osintChannelQuarantine) {
    const decision = scoring.osintChannelQuarantine.active
      ? getSocialQuarantineDecision(targetDate, reportScopeId, tryOpenValidationStore())
      : null;
    assessment.social_channel_quarantine = {
      ...scoring.osintChannelQuarantine,
      ...(decision?.created_at ? { confirmed_at: decision.created_at } : {}),
    };
  }
  if (epistemicEnrichment?.overall_score_calibrated != null) {
    assessment.overall_score_calibrated = epistemicEnrichment.overall_score_calibrated;
  }

  const patterns = detectSemanticPatterns(scopedSignals ?? scoring.scopedSignals ?? []);
  assessment.pattern_alerts = patterns;
  assessment.operator_recommendations = buildOperatorRecommendations(patterns);
}

function attachRegionalNationalComparison(assessment, {
  reportScopeId,
  comparisonContext,
  nationalScored,
  nationalSignals,
  nationalDataVoid,
  staleDigitalScores,
}) {
  if (!isRegionalReportScope(reportScopeId)) return;
  assessment.comparison_context = comparisonContext;
  const stale = staleDigitalScores ? { stale_at: staleDigitalScores.scored_at } : {};
  const base = {
    total_signals: nationalSignals.length,
    national_data_void: nationalDataVoid,
    ...stale,
  };
  if (comparisonContext?.comparable) {
    assessment.national_comparison = {
      ...base,
      overall_resilience_score: overallScore(nationalScored),
      comparable: true,
      comparability_index: comparisonContext.comparability_index,
    };
    return;
  }
  assessment.national_comparison = {
    ...base,
    overall_resilience_score: null,
    comparable: false,
    comparability_index: comparisonContext?.comparability_index ?? null,
    structured_share_delta: comparisonContext?.structured_share_delta ?? null,
    warning: 'Source mix differs from national baseline — direct score comparison invalid.',
  };
}

function buildReportMethodology(assessment, { scopedSignals, reportScopeId, validationMaturity, epistemicEnrichment, targetDate, getTotal }) {
  const { stageEvents } = getTotal();
  const assessStages = summarizeStageEvents(stageEvents);
  const costLogStages = readCostLogStagesForDate(targetDate, {
    scripts: ['extract-signals', 'assess-signals'],
  });
  const tuningProposal = proposeComponentTuningFromReportFiles(resolve('daily_reports'), { minReports: 10 });
  assessment.methodology = buildAssessmentMethodology({
    signals: scopedSignals,
    reportScopeId,
    scoringModelManifest: buildScoringModelManifest(),
    tuningProposal,
    validationMaturity,
    epistemicEnrichment,
    extractionTelemetry: {
      assess: assessStages,
      extract: costLogStages['extract-signals'] ?? null,
      assess_log: costLogStages['assess-signals'] ?? null,
    },
  });
  return tuningProposal;
}

async function attachPboCompletenessSummary(assessment, targetDate) {
  try {
    const pboReviewService = createDefaultPboReportReviewService({
      repoRoot: REPO_ROOT,
      sqlitePath: process.env.SQLITE_PATH?.trim()
        ? resolve(process.env.SQLITE_PATH.trim())
        : resolve(REPO_ROOT, 'db', 'app.sqlite'),
    });
    assessment.pbo_municipal_completeness = await pboReviewService.buildAssessmentSummary(targetDate);
  } catch (err) {
    console.error(`[assess-signals] PBO completeness summary skipped: ${err.message}`);
  }
}

function logAssessmentOutputs(assessment, outputBase, printSummary) {
  console.error(`\n=== Resilience Components ===`);
  for (const comp of assessment.components ?? []) {
    console.error(`  ${comp.component_id.padEnd(28)} (${comp.confidence}, ${comp.signal_count ?? 0} signals)`);
  }
  printSummary();
  console.error(`\nReports written:`);
  console.error(`  ${outputBase}.md (analyst/full scores)`);
  console.error(`  ${outputBase}-brief.md (operator brief, no /10)`);
  console.error(`  ${outputBase}.json`);
}

async function finalizeAndWriteReport({
  targetDate,
  reportScopeId,
  reportScope,
  getArg,
  onUsage,
  getTotal,
  printSummary,
  contentKind,
  loadedFiles,
  sourceFiles,
  totalArticles,
  pipelineConfig,
  scoring,
  retrievalService = null,
}) {
  const {
    nationalSignals,
    nationalScored,
    nationalDataVoid,
    scopedSignals,
    signalsForScoring,
    macroSignals,
    scopedTotalArticles,
    scopedSourceTypesSeen,
    scoredFull,
    scoreBySource,
    dataVoid,
    assessmentMode,
    epistemicStatus,
    staleDigitalScores,
    quarantinedDigital,
    validationMaturity,
    epistemicEnrichment,
    digitalQuarantineState,
  } = scoring;

  const priorReports = loadPriorReports(targetDate);
  if (priorReports.length > 0) {
    console.error(`\nPrior context: ${priorReports.map((r) => r.date).join(', ')}`);
  }

  const comparisonContext = isRegionalReportScope(reportScopeId)
    ? buildComparisonContext(signalsForScoring, nationalSignals, reportScopeId)
    : null;

  const assessment = await generateNarratives(scoredFull, signalsForScoring, targetDate, scopedTotalArticles, {
    onUsage,
    priorReports,
    contentKind,
    sourceTypes: scopedSourceTypesSeen,
    reportScope,
    comparisonScores: comparisonContext?.comparable ? nationalScored : null,
    comparisonLabel: isRegionalReportScope(reportScopeId) ? 'national' : null,
    comparisonComparable: comparisonContext?.comparable !== false,
    macroSignals,
    allScopedSignals: scopedSignals,
    dataVoid,
    oovCaptureCount: countOovCapturesForDate(targetDate),
    socialChannelQuarantine: scoring.osintChannelQuarantine ?? null,
    quarantinedDigital: quarantinedDigital ?? null,
    retrievalService,
  });

  retrievalService?.close();

  enrichAssessmentMetadata(assessment, {
    scoring,
    targetDate,
    reportScopeId,
    epistemicEnrichment,
    epistemic: {
      dataVoid,
      epistemicStatus,
      assessmentMode,
      staleDigitalScores,
      quarantinedDigital,
      digitalQuarantineState,
    },
    scopedSignals,
  });

  await attachDecisionBrief(assessment, {
    reportScopeId,
    onUsage,
  });

  const outputBase = resolveOutputBase(reportScopeId, targetDate, getArg);
  attachRegionalNationalComparison(assessment, {
    reportScopeId,
    comparisonContext,
    nationalScored,
    nationalSignals,
    nationalDataVoid,
    staleDigitalScores,
  });

  const tuningProposal = buildReportMethodology(assessment, {
    scopedSignals,
    reportScopeId,
    validationMaturity,
    epistemicEnrichment,
    targetDate,
    getTotal,
  });
  const subgroupLogLine = formatSubgroupCoverageLogLine(assessment.methodology);
  if (subgroupLogLine) console.error(subgroupLogLine);

  collectValidation(
    assessment,
    scopedSignals,
    outputBase,
    buildSignalPaths(loadedFiles),
    pipelineConfig,
    tuningProposal,
  );

  await attachPboCompletenessSummary(assessment, targetDate);
  writeReport(assessment, scopedSignals, [...new Set(sourceFiles)], outputBase, { scoreBySource });
  try {
    await publishDomainEvent({
      eventType: EVENT_TYPES.RESILIENCE_REPORT_WRITTEN,
      payload: {
        date: targetDate,
        scope: reportScopeId,
        jsonPath: `${outputBase}.json`,
      },
    });
  } catch (err) {
    console.error(`  ⚠ Event publish failed: ${err?.message ?? err}`);
  }
  logAssessmentOutputs(assessment, outputBase, printSummary);

  const { totalCostUsd, usageLog, stageEvents } = getTotal();
  appendCostLog({ script: 'assess-signals', date: targetDate, totalCostUsd, usageLog, stageEvents, articles: totalArticles });
}

async function run() {
  const {
    targetDate,
    days,
    reportScopeId,
    reportScope,
    getArg,
    bundleSource,
    observationsProfile,
  } = parseAssessCliArgs(process.argv.slice(2));

  assertApiKey();
  checkDailyBudget();

  const prepared = await loadPreparedSignals(targetDate, days, {
    bundleSource,
    observationsProfile,
  });
  logAssessmentHeader({ targetDate, days, reportScope, ...prepared });

  const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'assess-signals' });
  const scoring = await buildScopedScoring(
    targetDate,
    days,
    prepared.allSignals,
    prepared.totalArticles,
    reportScopeId,
    reportScope,
    prepared.loadedFiles,
  );

  logScoringResults(scoring.scopedSignals, scoring.signalsForScoring, scoring.scoredFull);

  await finalizeAndWriteReport({
    targetDate,
    reportScopeId,
    reportScope,
    getArg,
    onUsage,
    getTotal,
    printSummary,
    contentKind: prepared.contentKind,
    loadedFiles: prepared.loadedFiles,
    sourceFiles: prepared.sourceFiles,
    totalArticles: prepared.totalArticles,
    pipelineConfig: prepared.pipelineConfig,
    scoring,
    retrievalService: prepared.retrievalService,
  });
}

try {
  await run();
} catch (err) {
  console.error('assess-signals failed:', err.message);
  process.exit(1);
}
