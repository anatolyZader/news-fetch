/**
 * Report finalization for the assess-signals CLI: comparison context,
 * methodology, PBO completeness, diagnostics, and report writing.
 * Extracted verbatim from assessSignalsCli.js (behavior-preserving split).
 */

import { resolve } from 'node:path';

import { EVENT_TYPES, publishDomainEvent } from '../../../../cross-cut-modules/messaging/index.js';
import { buildComparisonContext } from '../../domain/services/sourceMixIndex.js';
import { isRegionalReportScope } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
import { resilienceReportsDir } from '../../domain/services/paths/outputDirs.js';
import { buildReportBasename } from '../../domain/services/paths/reportNames.js';
import { writeReport } from '../../infrastructure/reportWriter.js';
import { appendCostLog } from '../../../../cross-cut-modules/budget/index.js';
import { buildAssessmentWindowMetadata } from './assessSignalsHelpers.js';
import {
  buildAssessmentMethodology,
  buildScoringModelManifest,
  formatSubgroupCoverageLogLine,
} from '../../domain/epistemic/assessmentMethodology.js';
import { attachInvestigationDiagnostics } from '../../domain/services/operator/componentDiagnostics.js';
import { COMPONENT_IDS } from '../../domain/contracts/componentIds.js';
import { attachDecisionBrief } from './attachDecisionBrief.js';
import {
  summarizeStageEvents,
  readCostLogStagesForDate,
} from '../../domain/services/pipeline/pipelineStageTelemetry.js';
import { createDefaultPboReportReviewService } from '../../../pbo_report_review/index.js';
import { resolveSqlitePath } from '../../../../cross-cut-modules/config/sqlitePath.js';
import { REPO_ROOT, loadPriorReports } from './assessSignalsDeps.js';
import { applyOpenEvidenceScoringIfVerified } from './buildScopedScoring.js';

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
      comparable: true,
      comparability_index: comparisonContext.comparability_index,
    };
    return;
  }
  assessment.national_comparison = {
    ...base,
    comparable: false,
    comparability_index: comparisonContext?.comparability_index ?? null,
    structured_share_delta: comparisonContext?.structured_share_delta ?? null,
    warning: 'Source mix differs from national baseline — direct score comparison invalid.',
  };
}

function buildReportMethodology(assessment, { scopedSignals, reportScopeId, targetDate, getTotal }) {
  const { stageEvents } = getTotal();
  const assessStages = summarizeStageEvents(stageEvents);
  const costLogStages = readCostLogStagesForDate(targetDate, {
    scripts: ['extract-signals', 'assess-signals'],
  });
  assessment.methodology = buildAssessmentMethodology({
    signals: scopedSignals,
    reportScopeId,
    scoringModelManifest: buildScoringModelManifest(),
    extractionTelemetry: {
      assess: assessStages,
      extract: costLogStages['extract-signals'] ?? null,
      assess_log: costLogStages['assess-signals'] ?? null,
    },
  });
}

async function attachPboCompletenessSummary(assessment, targetDate) {
  try {
    const pboReviewService = createDefaultPboReportReviewService({
      repoRoot: REPO_ROOT,
      sqlitePath: resolveSqlitePath(process.env, REPO_ROOT),
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
  console.error(`  ${outputBase}.md (evidence-based report)`);
  console.error(`  ${outputBase}.json`);
}

export async function finalizeAndWriteReport({
  targetDate,
  days = 1,
  reportScopeId,
  reportScope: _reportScope,
  getArg,
  onUsage,
  getTotal,
  printSummary,
  contentKind: _contentKind,
  sourceFiles,
  totalArticles,
  scoring,
  retrievalService = null,
  sourceArchive = null,
  dailyBudgetExceeded: _dailyBudgetExceeded = false,
}) {
  const {
    nationalSignals,
    nationalDataVoid,
    scopedSignals,
    signalsForScoring,
    scoreBySource,
    staleDigitalScores,
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
    nationalSignals,
    nationalDataVoid,
    staleDigitalScores,
  });

  buildReportMethodology(assessment, {
    scopedSignals,
    reportScopeId,
    targetDate,
    getTotal,
  });
  const subgroupLogLine = formatSubgroupCoverageLogLine(assessment.methodology);
  if (subgroupLogLine) console.error(subgroupLogLine);

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
