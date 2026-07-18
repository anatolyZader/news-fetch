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
 *
 * Split across: assessSignalsDeps.js (bundle loading + safe service factories),
 * buildScopedScoring.js (scoring), finalizeReport.js (report finalization).
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

function assertApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
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
    sourceFiles: prepared.sourceFiles,
    totalArticles: prepared.totalArticles,
    scoring,
    retrievalService: prepared.retrievalService,
    sourceArchive: createSourceArchiveSafe(),
    dailyBudgetExceeded: budgetStatus.exceeded,
  });
}
