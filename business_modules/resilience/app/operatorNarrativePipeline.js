/**
 * Hybrid operator narrative pipeline: RAG → facts → merge agent claims → judge → polish → validate.
 */
import { buildNarrativeRetrievalContext } from '../infrastructure/narrativeRetrievalContext.js';
import { extractNarrativeFacts } from '../infrastructure/narrativeFactsExtract.js';
import {
  judgeNarrativeRelations,
  formatJudgeFeedback,
} from '../infrastructure/narrativeRelationJudge.js';
import { polishNarrativeFromClaims } from '../infrastructure/narrativePolish.js';
import { buildFullSignalDigest } from '../domain/services/buildFullSignalDigest.js';
import {
  buildDigestStubClaims,
  mergeAgentClaimsWithFacts,
} from '../domain/services/buildNarrativeScoredComponents.js';
import {
  buildSignalRefRegistry,
  validateNarrativeOutput,
  formatValidationFeedback,
  computeGroundingScores,
  validateSuppressionCompliance,
  formatSuppressionFeedback,
  hybridNarrativeEnabled,
  legacyNarrativeOnly,
  resolveNarrativePipelineMode,
  formatDigitalQuarantineNarrativeBlock,
  isNarrativeFactsPassEnabled,
  isNarrativeJudgeEnabled,
} from '../domain/services/narrativeGrounding/index.js';
import {
  escalateNarrativeContextPlan,
  isTokenOverflowError,
  narrativeContextMaxTokens,
  resolveNarrativeContextPlan,
} from '../domain/services/narrativePromptBudget.js';
import { finalizeOperatorNarrativeSurface } from '../domain/services/operatorNarrativeSurface.js';

const MAX_FACTS_ATTEMPTS = 2;
const MAX_POLISH_ATTEMPTS = 2;
const MAX_OVERFLOW_RETRIES = 2;

/**
 * @param {object} plan
 * @param {object} params
 * @returns {object}
 */
function rebudgetPlan(plan, params) {
  return escalateNarrativeContextPlan(plan, {
    narrativeScopeSignals: params.narrativeScopeSignals,
    scoredFull: params.scoredFull,
    scoringContext: params.narrativeScoringContext ?? params.scoredFull,
    macroSignals: params.macroSignals ?? [],
    startLevel: (plan?.degradeLevel ?? 0) + 1,
  });
}

/**
 * @param {object} params
 * @returns {Promise<object>}
 */
async function loadRagContext(narrativeScored, plan, retrievalService, reportDate) {
  if (plan.ragEnabled === false) {
    return { spansByComponent: {}, block: '' };
  }
  return buildNarrativeRetrievalContext(narrativeScored, {
    retrievalService,
    reportDate,
  });
}

/**
 * @param {object} params
 * @returns {Promise<{ factsByComponent: object, mergedNarratives: object, judgeFeedback: string }|null>}
 */
async function runFactsAndJudgePass(params) {
  const {
    assessment,
    narrativeScored,
    registry,
    rag,
    llmOpts,
    epistemicBlock,
    plan,
    pipelineParams,
  } = params;

  let factsByComponent = {};
  let mergedNarratives = { components: [] };
  let judgeFeedback = '';
  let activePlan = plan;

  for (let overflowRetry = 0; overflowRetry <= MAX_OVERFLOW_RETRIES; overflowRetry += 1) {
    try {
      for (let attempt = 0; attempt < MAX_FACTS_ATTEMPTS; attempt += 1) {
        if (activePlan.useStubClaims || !isNarrativeFactsPassEnabled()) {
          factsByComponent = buildDigestStubClaims(narrativeScored, registry);
        } else if (activePlan.factsEnabled !== false) {
          factsByComponent = await extractNarrativeFacts(narrativeScored, {
            ...llmOpts,
            retrievedSpansBlock: rag.block,
            epistemicBlock,
            factsShardSize: activePlan.factsShardSize,
            promptBudget: {
              section: 'narrative_facts',
              degrade_level: activePlan.degradeLevel,
              estimated_input_tokens: activePlan.section_estimates?.worst_facts_shard,
            },
          });
        }

        mergedNarratives = mergeAgentClaimsWithFacts(assessment, factsByComponent);
        if (!(mergedNarratives.components ?? []).some((c) => (c.narrative_claims ?? []).length > 0)) {
          return null;
        }

        if (activePlan.judgeEnabled === false || !isNarrativeJudgeEnabled()) break;

        const judgeResult = await judgeNarrativeRelations(mergedNarratives, registry, llmOpts);
        if (judgeResult.ok) break;
        judgeFeedback = formatJudgeFeedback(judgeResult.failures);
        if (attempt >= MAX_FACTS_ATTEMPTS - 1) {
          console.error(`[operator-narrative] Relation judge failures after ${MAX_FACTS_ATTEMPTS} attempts`);
        }
      }
      return { factsByComponent, mergedNarratives, judgeFeedback, plan: activePlan };
    } catch (err) {
      if (!isTokenOverflowError(err) || overflowRetry >= MAX_OVERFLOW_RETRIES) throw err;
      console.error(`[operator-narrative] Facts/judge token overflow — escalating budget (${err.message})`);
      activePlan = rebudgetPlan(activePlan, pipelineParams);
      if (activePlan.skipLlm) return null;
    }
  }
  return null;
}

/**
 * @param {object} params
 * @returns {Promise<object>}
 */
async function runPolishAndValidatePass(params) {
  const {
    mergedNarratives,
    registry,
    narrativeScored,
    rag,
    llmOpts,
    judgeFeedback,
    epistemicBlock,
    plan,
    pipelineParams,
  } = params;

  let polish = { components: [], cross_component_synthesis: '' };
  let validationFeedback = judgeFeedback;
  const degradeReasons = [];
  if (judgeFeedback) {
    degradeReasons.push('Relation judge: unresolved after facts pass');
  }

  let activePlan = plan;

  for (let overflowRetry = 0; overflowRetry <= MAX_OVERFLOW_RETRIES; overflowRetry += 1) {
    try {
      for (let attempt = 0; attempt < MAX_POLISH_ATTEMPTS; attempt += 1) {
        const feedback = [judgeFeedback, validationFeedback].filter(Boolean).join('\n\n');
        const polishResult = await polishNarrativeFromClaims(
          mergedNarratives,
          registry,
          narrativeScored,
          {
            ...llmOpts,
            retrievedSpansBlock: rag.block,
            feedback,
            epistemicBlock,
            skipProgress: false,
            shardSize: activePlan.polishShardSize,
            shardMinComponents: Math.min(3, activePlan.polishShardSize ?? 4),
            promptBudget: {
              section: 'narrative_polish',
              degrade_level: activePlan.degradeLevel,
              estimated_input_tokens: activePlan.section_estimates?.worst_polish_shard,
            },
          },
        );
        polish = polishResult;

        const validation = validateNarrativeOutput(polish, {
          scoredComponents: narrativeScored,
          registry,
        });
        const suppression = validateSuppressionCompliance(polish, narrativeScored);

        if (validation.ok && suppression.ok) break;

        if (polishResult.stopReason === 'max_tokens' && attempt < MAX_POLISH_ATTEMPTS - 1) {
          console.error('[operator-narrative] Polish truncated at max_tokens; skipping costly validation retry');
          break;
        }

        validationFeedback = [
          formatValidationFeedback(validation),
          formatSuppressionFeedback(suppression),
        ].filter(Boolean).join('\n\n');

        if (attempt >= MAX_POLISH_ATTEMPTS - 1) {
          console.error('[operator-narrative] Validation failed after polish retries; applying best-effort output');
          degradeReasons.push('Narrative validation: exhausted after polish retries');
        }
      }
      const polishOutput = { ...polish };
      delete polishOutput.stopReason;
      return {
        ...polishOutput,
        pipelineDegrade: degradeReasons.length > 0,
        degradeReasons,
        plan: activePlan,
      };
    } catch (err) {
      if (!isTokenOverflowError(err) || overflowRetry >= MAX_OVERFLOW_RETRIES) throw err;
      console.error(`[operator-narrative] Polish token overflow — escalating budget (${err.message})`);
      activePlan = rebudgetPlan(activePlan, pipelineParams);
      if (activePlan.skipLlm) {
        return { components: [], cross_component_synthesis: '', pipelineDegrade: true, degradeReasons: ['narrative_context_overflow'], plan: activePlan };
      }
    }
  }

  return { components: [], cross_component_synthesis: '', pipelineDegrade: true, degradeReasons: ['narrative_context_overflow'], plan: activePlan };
}

/**
 * @param {object} comp
 * @param {object} leg
 * @param {object|null|undefined} groundingScores
 */
function applyPolishLegToComponent(comp, leg, groundingScores) {
  comp.narrative_operator = leg.narrative;
  comp.narrative_grounding_score = groundingScores?.byComponent?.[comp.component_id]?.score ?? null;

  if (Array.isArray(leg.evidence) && leg.evidence.length > 0) {
    comp.evidence_operator = leg.evidence;
  }

  if (leg.data_quality_caveat) {
    comp.data_quality_caveat = leg.data_quality_caveat;
  }

  if (!legacyNarrativeOnly()) return;

  comp.narrative = leg.narrative;
  if (Array.isArray(leg.narrative_claims) && leg.narrative_claims.length > 0) {
    comp.narrative_claims = leg.narrative_claims;
  }
  if (Array.isArray(leg.evidence) && leg.evidence.length > 0) {
    comp.evidence = leg.evidence;
  }
}

/**
 * @param {object} params
 * @returns {Promise<object|null>}
 */
export async function runOperatorNarrativePipeline(params) {
  const {
    assessment,
    narrativeScopeSignals,
    scoredFull = null,
    narrativeScoringContext = null,
    scoringPartition = null,
    quarantinedDigital = null,
    signalsScoringUsed = null,
    retrievalService = null,
    reportDate,
    onUsage,
    llmPort,
    narrativeContextPlan = null,
    macroSignals = [],
  } = params;

  if (!assessment || !Array.isArray(narrativeScopeSignals) || narrativeScopeSignals.length === 0) {
    return null;
  }

  const scoringContext = narrativeScoringContext ?? scoredFull;
  let plan = narrativeContextPlan ?? resolveNarrativeContextPlan({
    narrativeScopeSignals,
    scoredFull,
    scoringContext,
    macroSignals,
  });

  if (plan.skipLlm) {
    return null;
  }

  let narrativeScored = plan.narrativeScored ?? buildFullSignalDigest(narrativeScopeSignals, scoringContext, {
    digestCap: plan.digestCap,
    evidenceChars: plan.evidenceChars,
  });
  let registry = plan.registry ?? buildSignalRefRegistry(narrativeScored);
  if (registry.refCount === 0) return null;

  const epistemicBlock = formatDigitalQuarantineNarrativeBlock({
    quarantinedDigital,
    scoringPartition,
    narrativeScopeSignalCount: narrativeScopeSignals.length,
    signalsScoringUsed: signalsScoringUsed ?? scoringPartition?.scoringSignals?.length ?? 0,
  });

  const llmOpts = { onUsage, llmPort };
  const pipelineParams = { ...params, narrativeScoringContext: scoringContext };

  const rag = await loadRagContext(narrativeScored, plan, retrievalService, reportDate);

  const factsResult = await runFactsAndJudgePass({
    assessment,
    narrativeScored,
    registry,
    rag,
    llmOpts,
    epistemicBlock,
    plan,
    pipelineParams,
  });
  if (!factsResult) return null;

  plan = factsResult.plan ?? plan;

  const polishResult = await runPolishAndValidatePass({
    mergedNarratives: factsResult.mergedNarratives,
    registry,
    narrativeScored,
    rag,
    llmOpts,
    judgeFeedback: factsResult.judgeFeedback,
    epistemicBlock,
    plan,
    pipelineParams,
  });
  const { pipelineDegrade, degradeReasons, plan: finalPlan, ...polish } = polishResult;

  const groundingScores = computeGroundingScores(polish, narrativeScored, registry);
  return {
    polish,
    groundingScores,
    narrativeScored,
    registry,
    pipelineDegrade,
    degradeReasons,
    narrativeContextPlan: finalPlan ?? plan,
  };
}

/**
 * Apply pipeline output to assessment (hybrid or legacy mode).
 * @param {object} assessment
 * @param {object} pipelineResult
 */
export function applyOperatorNarrativeToAssessment(assessment, pipelineResult) {
  if (!assessment || !pipelineResult?.polish) return assessment;

  const mode = resolveNarrativePipelineMode();
  const { polish, groundingScores, narrativeContextPlan } = pipelineResult;
  const polishById = Object.fromEntries(
    (polish.components ?? []).map((c) => [c.component_id, c]),
  );

  for (const comp of assessment.components ?? []) {
    const leg = polishById[comp.component_id];
    if (!leg?.narrative) continue;
    applyPolishLegToComponent(comp, leg, groundingScores);
  }

  if (polish.cross_component_synthesis) {
    assessment.cross_component_synthesis_operator = polish.cross_component_synthesis;
    if (legacyNarrativeOnly()) {
      assessment.cross_component_synthesis = polish.cross_component_synthesis;
    }
  }

  assessment.narrative_pipeline_mode = mode;
  if (narrativeContextPlan) {
    assessment.narrative_prompt_budget = {
      degrade_level: narrativeContextPlan.degradeLevel,
      section_estimates: narrativeContextPlan.section_estimates,
      registry_count: narrativeContextPlan.registry?.refCount ?? 0,
      digest_cap: narrativeContextPlan.digest_cap,
      max_context_tokens: narrativeContextMaxTokens(),
    };
  }
  if (pipelineResult.pipelineDegrade) {
    assessment.narrative_pipeline_degraded = true;
    assessment.narrative_pipeline_degrade_reasons = pipelineResult.degradeReasons ?? [];
  }
  return assessment;
}

/**
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function applyOperatorNarrativePipeline(params) {
  const { assessment } = params;
  if (!hybridNarrativeEnabled() && !legacyNarrativeOnly()) {
    assessment.narrative_pipeline_mode = resolveNarrativePipelineMode();
    return finalizeOperatorNarrativeSurface(assessment);
  }

  try {
    const result = await runOperatorNarrativePipeline(params);
    if (result) {
      applyOperatorNarrativeToAssessment(assessment, result);
    }
  } catch (err) {
    console.error(`[operator-narrative] Pipeline failed (${err.message}); keeping score shell`);
    if (isTokenOverflowError(err)) {
      assessment.narrative_pipeline_degraded = true;
      assessment.narrative_pipeline_degrade_reasons = ['narrative_context_overflow'];
    }
  }

  return finalizeOperatorNarrativeSurface(assessment);
}
