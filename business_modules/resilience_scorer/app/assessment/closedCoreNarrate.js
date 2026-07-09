/**
 * Closed-core narrate: score shell + preflight budget + hybrid operator narrative pipeline.
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
 * @param {Record<string, object>} scoredFull
 * @param {object[]} _allSignals
 * @param {string} date
 * @param {number} totalArticles
 * @param {object} [opts]
 * @returns {Promise<object>}
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
    digest_cap: plan.digest_cap,
  };

  return shell;
}
