#!/usr/bin/env node
/**
 * Stage-2 assessment CLI orchestrator: load bundles → evidence pipeline → narrate → persist report.
 *
 * **Owns:** CLI argument parsing delegation, budget/cost tracking, bundle discovery wiring,
 * scoped evidence preparation, and report finalization handoff.
 *
 * **Pipeline position:** Stage 2 of the resilience pipeline; invoked by `input/assess-signals.js`
 * and indirectly by `input/run-pipeline.js` after ingest completes.
 *
 * **Inputs:** `--date`, `--days` (1–14), `--scope`, optional bundle source/profile flags;
 * pre-extracted JSON bundles on disk (news, radio, whatsapp, visits, PBO, regional PBO,
 * Naftali, social). Bundle dates must be ≤ `--date` and within the N-day window (no forward
 * leakage on historical replay).
 *
 * **Outputs:** console progress to stderr; assessment report JSON via `finalizeAndWriteReport`;
 * optional RAG index backfill for article corpus.
 *
 * **Does NOT:** run signal extraction, compute numeric 1–10 resilience scores, or invoke
 * the specialist agent directly (delegates to `assessmentStageRunner` / `produceAssessment`).
 *
 * **Collaborators:** `assessSignalsDeps.js` (load bundles), `buildScopedScoring.js`
 * (scope + evidence prep), `assessmentStageRunner.js` (shared assess core),
 * `finalizeReport.js` (write artifacts), `cross-cut-modules/budget` (cost caps).
 *
 * Usage:
 *   node assess-signals.js --date YYYY-MM-DD [--days N] [--scope national|north|…] [--output <path-without-ext>]
 *
 * Temporal weights on loaded bundles: T=1, T-1=0.85, T-2=0.70, then geometric decay (floor 0.50).
 */

import 'dotenv/config';
import { bootstrapDefaultStateStore } from '../../../../cross-cut-modules/persistence/bootstrapStateStore.js';

bootstrapDefaultStateStore();

import { createCostTracker, resolveMaxCostUsd } from '../../../../cross-cut-modules/budget/index.js';
import { getDailyBudgetStatus } from '../../../../cross-cut-modules/budget/app/httpDailyBudget.js';
import { parseAssessCliArgs } from './assessSignalsHelpers.js';
import { summarizeGeoCoverage, summarizeGeoQuality } from '../../../../cross-cut-modules/geo/signalGeoSummary.js';
import { ensureArticleCorpusRagIndexed } from './ensureArticleCorpusRagIndexed.js';
import {
  REPO_ROOT,
  formatDaysSuffix,
  createSourceArchiveSafe,
  loadPreparedSignals,
} from './assessSignalsDeps.js';
import { buildScopedScoring } from './buildScopedScoring.js';
import { finalizeAndWriteReport } from './finalizeReport.js';

/** Fail fast when ANTHROPIC_API_KEY is missing (narrative/agent paths require it). */
function assertApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
}

/** stderr banner: date window, scope label, per-source bundle weights, signal/article counts. */
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

/**
 * stderr summary after evidence pipeline: metrics-eligible signal count, optional geo stats,
 * and per-component evidence rows (legacy log shape; score fields are null in min-math).
 */
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

/**
 * Main Stage-2 CLI entry: parse args, load bundles, run scoped evidence + assessment, write report.
 *
 * @returns {Promise<void>} Resolves when report is written; throws on fatal errors (caller exits 1).
 * @sideEffects stderr logging; LLM/RAG usage via cost tracker; may write report + epistemic artifacts.
 */
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

  const sourceArchive = createSourceArchiveSafe();
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
      sourceArchive,
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
    sourceFiles: prepared.sourceFiles,
    totalArticles: prepared.totalArticles,
    scoring,
    retrievalService: prepared.retrievalService,
    sourceArchive,
    dailyBudgetExceeded: budgetStatus.exceeded,
  });
}
