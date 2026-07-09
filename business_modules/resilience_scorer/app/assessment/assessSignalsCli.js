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
 * Auto-discovers business_modules/resilience_scorer/data/signals/signals-{type}-{date}.json,
 * field signals under business_modules/visits/data/signals/, and social OSINT under
 * business_modules/social_media/data/ for the requested date window.
 * Temporal weights: T=1, T-1=0.85, T-2=0.70, then geometric decay (floor 0.50).
 */

import 'dotenv/config';
import { bootstrapDefaultStateStore } from '../../../../cross-cut-modules/persistence/bootstrapStateStore.js';
import { EVENT_TYPES, publishDomainEvent } from '../../../../cross-cut-modules/messaging/index.js';

bootstrapDefaultStateStore();

import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { overallScore, scoreComponents } from '../scoringFacade.js';
import { buildComparisonContext } from '../../domain/services/sourceMixIndex.js';
import { isRegionalReportScope } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
import { resilienceReportsDir } from '../../domain/services/paths/outputDirs.js';
import { buildReportBasename, listReportJsonFilenamesForDate } from '../../domain/services/paths/reportNames.js';
import { ISRAEL_NATIONAL_DISTRICT_ID } from '../../../../cross-cut-modules/geo/israelDistricts.js';
import { writeReport } from '../../infrastructure/reportWriter.js';
import { createCostTracker, appendCostLog, resolveMaxCostUsd } from '../../../../cross-cut-modules/budget/index.js';
import { getDailyBudgetStatus } from '../../../../cross-cut-modules/budget/app/httpDailyBudget.js';
import {
  loadHistoricalScores,
  loadHistoricalSignalDays,
} from '../../infrastructure/reportHistoryReader.js';
import {
  crossSourceDedupClustered,
  parseAssessCliArgs,
  loadPipelineConfig,
  mergeLoadedSignalFiles,
  dedupWithinSource,
  buildAssessmentWindowMetadata,
} from './assessSignalsHelpers.js';
import { summarizeGeoCoverage, summarizeGeoQuality } from '../../../../cross-cut-modules/geo/signalGeoSummary.js';
import { enrichSignalsGeoIfNeeded } from '../../../../cross-cut-modules/geo/enrichSignalsGeoIfNeeded.js';
import { runPostExtractionAssessmentCore } from './assessmentStage.js';
import { ensureArticleCorpusRagIndexed } from './ensureArticleCorpusRagIndexed.js';
import {
  buildAssessmentMethodology,
  buildScoringModelManifest,
  formatScopeDecisionLogLine,
  formatSubgroupCoverageLogLine,
} from '../../domain/epistemic/assessmentMethodology.js';
import { computeDataVoidIndex } from '../../domain/services/dataVoidIndex.js';
import { attachInvestigationDiagnostics } from '../../domain/services/operator/componentDiagnostics.js';
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { runScoringPipeline } from './scoringPipelinePrep.js';
import { attachDecisionBrief } from './attachDecisionBrief.js';
import { salienceContextFromDataVoid } from '../../domain/epistemic/highSalienceBypass.js';
import { proposeComponentTuningFromReportFiles } from '../../analyst/tuning/domain/componentTuningProposal.js';
import {
  summarizeStageEvents,
  readCostLogStagesForDate,
} from '../../domain/services/pipelineStageTelemetry.js';
import createValidationCollectionService from '../../analyst/validation/app/validationCollectionService.js';
import { loadConnectivityProbeSignals, loadProbeRecordsForDate } from '../../infrastructure/adapters/connectivityProbeFileAdapter.js';
import { enrichProbeSignalsInList } from '../../domain/services/signals/probeCorroborationPolicy.js';
import { createDefaultPboReportReviewService } from '../../../pbo_report_review/index.js';
import { createSourceArchive } from '../../../../db/source_archive/createSourceArchive.js';
import { archiveProbeRecords } from '../../../../db/source_archive/archiveProbeRecords.js';
import { createRetrievalService } from '../../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { createSignalBundlePort } from './createSignalBundlePort.js';
import { closedSignalsDir } from '../../../../cross-cut-modules/resilience-contracts/index.js';
import { loadOpenObservationsForAssess } from './loadOpenObservationsForAssess.js';
import { isOmissionAuditEnabled } from '../../domain/services/oov/openExtractConfig.js';
import { verifyOpenEvidenceClaims } from '../../domain/services/signals/openEvidenceVerification.js';
import { synthesizeOpenEvidenceScoringSignals } from '../../domain/services/signals/openEvidenceScoringSignals.js';
import { enqueueVerifiedOpenForCatalog } from '../catalog/enqueueVerifiedOpenForCatalog.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const SIGNAL_DIRS = {
  signalsDir: closedSignalsDir(),
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
  const dir = resilienceReportsDir();
  if (!existsSync(dir)) return [];
  const prior = [];
  const d = new Date(targetDate);
  for (let i = 1; i <= n; i++) {
    const p = new Date(d);
    p.setDate(d.getDate() - i);
    const pd = p.toISOString().slice(0, 10);
    const matches = listReportJsonFilenamesForDate(dir, pd, 'national');
    const match = [...matches].sort((a, b) => a.localeCompare(b)).at(-1);
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

function createSourceArchiveSafe() {
  try {
    const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
    return createSourceArchive(sqlitePath);
  } catch (err) {
    console.error(`  ⚠ Source archive unavailable: ${err.message}`);
    return null;
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

function enrichSignalsGeoForAssess(allSignals) {
  return enrichSignalsGeoIfNeeded(allSignals, {
    rootDir: REPO_ROOT,
    unknownSourceType: 'assess-signals',
  });
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

  let { allSignals, totalArticles, sourceFiles, sourceTypesSeen } = mergeLoadedSignalFiles(loadedFiles, { targetDate });
  allSignals = mergeConnectivityProbeSignals(allSignals, sourceTypesSeen, targetDate);
  archiveProbeRecordsForDate(targetDate);
  allSignals = enrichProbeSignalsInList(allSignals);
  allSignals = dedupWithinSource(allSignals);

  const retrievalService = createRetrievalServiceSafe();
  allSignals = await dedupSignalsCrossSource(allSignals, retrievalService);
  allSignals = enrichSignalsGeoForAssess(allSignals);

  const { openObservations, summary: openObservationsSummary } = isOmissionAuditEnabled()
    ? { openObservations: [], summary: null }
    : await loadOpenObservationsForAssess({
      targetDate,
      days,
    });

  return {
    loadedFiles,
    allSignals,
    totalArticles,
    sourceFiles,
    sourceTypesSeen,
    retrievalService,
    pipelineConfig,
    contentKind: contentKindFromSourceTypes(sourceTypesSeen),
    openObservations,
    openObservationsSummary,
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
  narrativeScopeSignals,
  narrativeNationalContext,
  dataVoid,
  scopeLogLine,
}) {
  if (isRegionalReportScope(reportScopeId) && macroSignals.length > 0) {
    console.error(`  → Epistemic partition: ${metricsSignals.length} metrics-eligible, ${macroSignals.length} macro/context-only`);
  }
  if (isRegionalReportScope(reportScopeId) && narrativeScopeSignals != null) {
    console.error(
      `  → Narrative scope: ${narrativeScopeSignals.length} signals (${narrativeNationalContext?.length ?? 0} national context)`,
    );
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

async function buildScopedScoring(targetDate, days, allSignals, totalArticles, reportScopeId, reportScope, loadedFiles, openObservations = [], routingOpts = {}) {
  const nationalSignals = allSignals;
  const nationalHistoricalDays = isRegionalReportScope(reportScopeId)
    ? loadHistoricalSignalDays(targetDate, resilienceReportsDir(), 7, ISRAEL_NATIONAL_DISTRICT_ID)
    : loadHistoricalSignalDays(targetDate, resilienceReportsDir(), 7, reportScopeId);

  const routedOpenObservations = openObservations.length
    ? await (async () => {
      const { routeOpenObservations } = await import('../../open_observation_extraction/index.js');
      return routeOpenObservations(openObservations, routingOpts);
    })()
    : [];

  if (routedOpenObservations.length > 0) {
    console.error(`  → Open observations loaded: ${routedOpenObservations.length} (pipeline parallel extract)`);
  }

  const historicalScores = loadHistoricalScores(targetDate, resilienceReportsDir(), 14, reportScopeId);
  if (Object.keys(historicalScores).length > 0) {
    console.error(`  Loaded historical score series for ${Object.keys(historicalScores).length} components`);
  }

  const nationalDataVoid = isRegionalReportScope(reportScopeId)
    ? computeDataVoidIndex(nationalSignals, nationalHistoricalDays, { reportScope: ISRAEL_NATIONAL_DISTRICT_ID })
    : null;

  let coreResult;
  try {
    coreResult = await runPostExtractionAssessmentCore({
      allSignals,
      reportScopeId,
      reportDate: targetDate,
      totalArticles,
      reportsDir: resilienceReportsDir(),
      historicalScores,
      onUsage: routingOpts.onUsage,
      retrievalService: routingOpts.retrievalService ?? null,
      sourceArchive: routingOpts.sourceArchive ?? null,
      openObservations: routedOpenObservations,
      openObservationsSummary: routingOpts.openObservationsSummary ?? null,
      rootDir: REPO_ROOT,
      dailyBudgetExceeded: routingOpts.dailyBudgetExceeded ?? false,
      attachDecisionBrief: false,
      skipRagBackfill: true,
      assessmentDays: days,
    });
  } catch (err) {
    if (err?.code === 'empty_scoped_evidence') {
      const suffix = formatDaysSuffix(days);
      console.error(`No signal files contained ${reportScope.label} evidence for ${targetDate}${suffix}.`);
      process.exit(1);
    }
    if (err?.code === 'default_north_threshold_exceeded') {
      const gate = err.gate ?? {};
      console.error(
        `Default-north fallback ${gate.pct ?? '?'}% exceeds threshold ${gate.thresholdPct ?? '?'}% `
        + `(${gate.count ?? '?'} signals) — fix extractor district_id or set RESILIENCE_DEFAULT_NORTH_GATE_BLOCK=0`,
      );
      process.exit(1);
    }
    throw err;
  }

  const {
    assessment,
    scopedSignals,
    macroSignals,
    narrativeNationalContext,
    narrativeScopeSignals,
    investigationSignals,
    investigationEpistemic,
    signalsForScoring,
    scopedTotalArticles,
    scoredFull,
    pipelineResult,
    investigationPrep,
    dataVoid,
    salienceContext,
  } = coreResult;

  const metricsSignals = scopedSignals.filter((s) => s?.metricsEligible !== false);
  const scopeMethodologyPreview = buildAssessmentMethodology({ signals: scopedSignals, reportScopeId });
  const scopeLogLine = formatScopeDecisionLogLine(scopeMethodologyPreview);
  logBuildScopedDiagnostics({
    reportScopeId,
    reportScope,
    nationalSignals,
    scopedSignals,
    metricsSignals,
    macroSignals,
    narrativeScopeSignals,
    narrativeNationalContext,
    dataVoid,
    scopeLogLine,
  });

  let nationalSalienceContext = salienceContextFromDataVoid(dataVoid);
  const nationalScored = scoreComponents(nationalSignals, { totalArticles, salienceContext: nationalSalienceContext });

  const scopedSourceTypesSeen = new Set(signalsForScoring.map((s) => s.source_type).filter(Boolean));
  const scoreBySource = buildScoreBySource({
    scopedSourceTypesSeen,
    signalsForScoring,
    reportScopeId,
    loadedFiles,
    salienceContext,
  });

  return {
    assessment,
    nationalSignals,
    nationalScored,
    nationalDataVoid,
    scopedSignals,
    investigationSignals,
    investigationEpistemic,
    signalsForScoring,
    macroSignals,
    scopedTotalArticles,
    scoredFull,
    scoreBySource,
    dataVoid,
    osintChannelQuarantine: investigationPrep.osintChannelQuarantine,
    oovBurst: investigationPrep.oovBurst,
    priorQuarantine: investigationPrep.priorQuarantine,
    assessmentMode: investigationEpistemic.assessmentMode,
    epistemicStatus: investigationEpistemic.epistemicStatus,
    scoringAssessmentMode: pipelineResult.assessmentMode,
    scoringEpistemicStatus: pipelineResult.epistemicStatus,
    staleDigitalScores: pipelineResult.staleDigitalScores,
    quarantinedDigital: pipelineResult.quarantinedDigital,
    validationMaturity: coreResult.validationMaturity,
    epistemicEnrichment: pipelineResult.epistemicEnrichment,
    oovScoringApplied: coreResult.oovScoringApplied,
    digitalQuarantineState: pipelineResult.digitalQuarantineState,
    scoringPartition: pipelineResult.partition ?? null,
    openObservations: routedOpenObservations,
    openObservationsSummary: routingOpts.openObservationsSummary ?? null,
    scoringPipelineContext: coreResult.scoringPipelineContext,
  };
}

async function applyOpenEvidenceScoringIfVerified({
  assessment,
  scoring,
  targetDate,
  reportScopeId,
}) {
  if (isOmissionAuditEnabled()) return;
  const openObservations = scoring.openObservations ?? [];
  const verified = verifyOpenEvidenceClaims(assessment, openObservations, assessment._evidence_graph);
  if (!verified.length) return;

  const { signals: syntheticOpen, applied } = synthesizeOpenEvidenceScoringSignals(
    verified,
    openObservations,
    { reportDate: targetDate, reportScopeId },
  );
  if (!applied || !syntheticOpen.length) return;

  const ctx = scoring.scoringPipelineContext ?? {};
  const pipelineResult = runScoringPipeline({
    signalsForScoring: [...scoring.signalsForScoring, ...syntheticOpen],
    dataVoid: ctx.dataVoid ?? scoring.dataVoid,
    totalArticles: ctx.scopedTotalArticles ?? scoring.scopedTotalArticles,
    mediaSignals: ctx.scopedSignals ?? scoring.scopedSignals,
    salienceContext: ctx.salienceContext,
    historicalScores: ctx.historicalScores ?? {},
    scopeId: reportScopeId,
    validationMaturity: ctx.validationMaturity ?? scoring.validationMaturity,
    priorQuarantine: ctx.priorQuarantine ?? scoring.priorQuarantine,
    reportDate: targetDate,
  });

  scoring.scoredFull = pipelineResult.scoredFull;
  scoring.signalsForScoring = pipelineResult.scoringSignals;
  scoring.openEvidenceScoringApplied = applied;
  console.error(`  → Open evidence scoring: ${syntheticOpen.length} verified synthetic signal(s)`);

  const enqueueResult = await enqueueVerifiedOpenForCatalog(verified, openObservations, {
    assessment,
    reportDate: targetDate,
    reportScopeId,
    repoRoot: REPO_ROOT,
  });
  if (enqueueResult.enqueued > 0) {
    console.error(`  → Catalog evolution enqueue: ${enqueueResult.enqueued} verified open observation(s)`);
  }
  if (enqueueResult.proposals_generated > 0) {
    console.error(`  → Catalog auto-proposals: ${enqueueResult.proposals_generated} draft(s)`);
  }
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

function resolveOutputBase(reportScopeId, targetDate, days, getArg) {
  const cliOutputBase = getArg('--output')?.replace(/\.(md|json)$/, '');
  if (cliOutputBase) return cliOutputBase;
  const basename = buildReportBasename({
    scopeId: reportScopeId,
    days,
    reportDate: targetDate,
  });
  return resolve(resilienceReportsDir(), basename);
}

function buildSignalPaths(loadedFiles) {
  return loadedFiles.map(({ file, sourceType, data }) => {
    if (data?._from_observations) {
      return resolve('business_modules/open_observation_extraction/data', file);
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

function buildEpistemicProfileShim(scoredFull) {
  const by_component = {};
  for (const id of COMPONENT_IDS) {
    const c = scoredFull?.[id] ?? {};
    by_component[id] = {
      signal_count: c.signal_count ?? 0,
      evidence_mass: c.evidence_mass ?? 0,
      thin_evidence: c.thin_evidence === true,
      investigation_eligible: c.investigation_eligible === true,
      contested: c.contested === true,
    };
  }
  return { by_component };
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
  const tuningProposal = proposeComponentTuningFromReportFiles(resilienceReportsDir(), { minReports: 10 });
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
  days = 1,
  reportScopeId,
  reportScope: _reportScope,
  getArg,
  onUsage,
  getTotal,
  printSummary,
  contentKind: _contentKind,
  loadedFiles,
  sourceFiles,
  totalArticles,
  pipelineConfig,
  scoring,
  retrievalService = null,
  sourceArchive = null,
  dailyBudgetExceeded: _dailyBudgetExceeded = false,
}) {
  const {
    nationalSignals,
    nationalScored,
    nationalDataVoid,
    scopedSignals,
    signalsForScoring,
    scoreBySource,
    staleDigitalScores,
    validationMaturity,
    epistemicEnrichment,
  } = scoring;

  const priorReports = loadPriorReports(targetDate);
  if (priorReports.length > 0) {
    console.error(`\nPrior context: ${priorReports.map((r) => r.date).join(', ')}`);
  }

  const comparisonContext = isRegionalReportScope(reportScopeId)
    ? buildComparisonContext(signalsForScoring, nationalSignals, reportScopeId)
    : null;

  const assessment = scoring.assessment;
  if (!assessment) {
    throw new Error('finalizeAndWriteReport: scoring.assessment is required (runPostExtractionAssessmentCore)');
  }

  await applyOpenEvidenceScoringIfVerified({
    assessment,
    scoring,
    targetDate,
    reportScopeId,
  });

  retrievalService?.close();
  sourceArchive?.close?.();

  await attachDecisionBrief(assessment, {
    reportScopeId,
    onUsage,
  });

  const epistemicProfileForDiagnostics = buildEpistemicProfileShim(scoring.scoredFull);
  attachInvestigationDiagnostics(assessment, {
    scoring,
    scoreBySource,
    epistemicProfile: epistemicProfileForDiagnostics,
    investigationPlan: assessment.investigation_plan,
  });

  const outputBase = resolveOutputBase(reportScopeId, targetDate, days, getArg);
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
  const pipelinePreset = getArg?.('--preset')?.trim() || null;
  const assessmentWindow = buildAssessmentWindowMetadata(targetDate, days, { pipelinePreset });
  writeReport(
    assessment,
    scopedSignals,
    [...new Set(sourceFiles)],
    outputBase,
    { scoreBySource, assessmentWindow },
  );
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

export async function runAssessSignalsCli() {
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
  const budgetStatus = getDailyBudgetStatus();
  if (budgetStatus.exceeded) {
    console.error(
      `[assess-signals] Daily API budget $${budgetStatus.limit.toFixed(2)} exceeded ` +
      `(spent: $${budgetStatus.spent.toFixed(4)}) — agent LLM skipped; deterministic degrade will run.`,
    );
  }

  const prepared = await loadPreparedSignals(targetDate, days, {
    bundleSource,
    observationsProfile,
  });
  logAssessmentHeader({ targetDate, days, reportScope, ...prepared });

  const maxCostUsd = resolveMaxCostUsd({
    script: 'assess-signals',
    scope: reportScopeId,
    signalCount: prepared.allSignals.length,
  });
  if (maxCostUsd > 3) {
    console.error(
      `  📊 Assess cost cap: $${maxCostUsd.toFixed(2)} (scope=${reportScopeId}, signals=${prepared.allSignals.length})`,
    );
  }

  const { onUsage, getTotal, printSummary } = createCostTracker({
    label: 'assess-signals',
    maxCostUsd,
  });
  if (prepared.retrievalService?.setOnUsage) {
    prepared.retrievalService.setOnUsage(onUsage);
  }
  await ensureArticleCorpusRagIndexed({
    targetDate,
    days,
    retrievalService: prepared.retrievalService,
    repoRoot: REPO_ROOT,
  });

  const scoring = await buildScopedScoring(
    targetDate,
    days,
    prepared.allSignals,
    prepared.totalArticles,
    reportScopeId,
    reportScope,
    prepared.loadedFiles,
    prepared.openObservations ?? [],
    { onUsage, openObservationsSummary: prepared.openObservationsSummary,
      retrievalService: prepared.retrievalService,
      sourceArchive: createSourceArchiveSafe(),
      dailyBudgetExceeded: budgetStatus.exceeded },
  );

  logScoringResults(scoring.scopedSignals, scoring.signalsForScoring, scoring.scoredFull);

  await finalizeAndWriteReport({
    targetDate,
    days,
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
    sourceArchive: createSourceArchiveSafe(),
    dailyBudgetExceeded: budgetStatus.exceeded,
  });
}

