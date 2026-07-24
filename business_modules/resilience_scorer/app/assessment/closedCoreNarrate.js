/**
 * Closed-core narrate path: evidence shell + preflight budget + hybrid operator narrative.
 *
 * **Owns:** routing between legacy monolithic narrate and hybrid digest/facts pipeline for
 * closed-core assessment mode (no specialist agent).
 *
 * **Pipeline position:** Stage-2 narrate branch in `assessmentStageRunner.produceAssessmentForMode`.
 *
 * **Inputs:** `scoredFull`, narrative-scope signals, date, article count, LLM/retrieval opts.
 *
 * **Outputs:** assessment object with component/cross-component prose when budget allows.
 *
 * **Does NOT:** run planner/specialist agents or compute numeric resilience scores.
 *
 * **Collaborators:** `buildClosedCoreAssessmentShell`, `operatorNarrativePipeline`,
 * `narrativePromptBudget`, `claudeNarratives.generateNarrativesLegacy`.
 */
import { legacyNarrativeOnly } from '../../domain/services/narrativeGrounding/groundingConfig.js';
import { resolveNarrativeContextPlan } from '../../domain/services/narrative/narrativePromptBudget.js';
import { applyOperatorNarrativePipeline } from './operatorNarrativePipeline.js';
import {
  applyNarrativeOverflowDegrade,
  buildClosedCoreAssessmentShell,
} from './buildClosedCoreAssessmentShell.js';
import { generateNarrativesLegacy } from '../../infrastructure/claudeNarratives.js';

/**
 * Run closed-core or legacy narrative generation for an evidence-only assessment shell.
 *
 * @param {Record<string, object>} scoredFull — per-component evidence map
 * @param {object[]} _allSignals — metrics/scoring signal pool (may differ from narrative scope)
 * @param {string} date — report date YYYY-MM-DD
 * @param {number} totalArticles
 * @param {object} [opts] — narrativeScopeSignals, retrievalService, llmPort, macroSignals, etc.
 * @returns {Promise<object>} assessment with narratives or overflow degrade metadata
 * @sideEffects LLM calls via operator narrative pipeline when not skipped by preflight
 */
export async function closedCoreNarrate(scoredFull, _allSignals, date, totalArticles, opts = {}) {
  if (legacyNarrativeOnly()) {
    return generateNarrativesLegacy(scoredFull, _allSignals, date, totalArticles, opts);
  }

  const {
    narrativeScopeSignals = _allSignals,
    scoredFull: scoredContext = scoredFull,
    narrativeScoringContext = null,
    scoringPartition = null,
    quarantinedDigital = null,
    signalsScoringUsed = null,
    retrievalService = null,
    onUsage,
    llmPort,
    macroSignals = [],
    reportScope = null,
    dataVoid = null,
    oovCaptureCount = 0,
    socialChannelQuarantine = null,
    allScopedSignals = null,
    contentKind = 'news',
  } = opts;

  const shell = buildClosedCoreAssessmentShell({
    scoredFull,
    reportDate: date,
    scopedTotalArticles: totalArticles,
    reportScope,
    macroSignals,
    dataVoid,
    oovCaptureCount,
    socialChannelQuarantine,
    allScopedSignals,
    contentKind,
  });

  if (!Array.isArray(narrativeScopeSignals) || narrativeScopeSignals.length === 0) {
    return shell;
  }

  const plan = resolveNarrativeContextPlan({
    narrativeScopeSignals,
    scoredFull: scoredContext,
    scoringContext: narrativeScoringContext ?? scoredContext,
    macroSignals,
  });

  if (plan.skipLlm) {
    return applyNarrativeOverflowDegrade(shell, plan);
  }

  await applyOperatorNarrativePipeline({
    assessment: shell,
    narrativeScopeSignals,
    scoredFull: scoredContext,
    narrativeScoringContext: narrativeScoringContext ?? scoredContext,
    scoringPartition,
    quarantinedDigital,
    signalsScoringUsed,
    retrievalService,
    reportDate: date,
    onUsage,
    llmPort,
    narrativeContextPlan: plan,
    macroSignals,
  });

  shell.narrative_prompt_budget = {
    degrade_level: plan.degradeLevel,
    section_estimates: plan.section_estimates,
    registry_count: plan.registry?.refCount ?? 0,
    digest_cap: plan.digestCap,
  };

  return shell;
}
