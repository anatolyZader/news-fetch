/**
 * Hybrid operator narrative pipeline: RAG → facts → merge agent claims → judge → polish → validate.
 */
import { buildNarrativeRetrievalContext } from '../../infrastructure/narrativeRetrievalContext.js';
import { extractNarrativeFacts } from '../../infrastructure/narrativeFactsExtract.js';
import {
  judgeNarrativeRelations,
  formatJudgeFeedback,
} from '../../infrastructure/narrativeRelationJudge.js';
import { polishNarrativeFromClaims } from '../../infrastructure/narrativePolish.js';
import { buildFullSignalDigest } from '../../domain/services/narrative/buildFullSignalDigest.js';
import {
  buildDigestStubClaims,
  mergeAgentClaimsWithFacts,
  supplementFactsWithDigestStubs,
} from '../../domain/services/narrative/narrativeClaims.js';
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
  resolveInlineSignalCitations,
} from '../../domain/services/narrativeGrounding/index.js';
import {
  escalateNarrativeContextPlan,
  isTokenOverflowError,
  narrativeContextMaxTokens,
  resolveNarrativeContextPlan,
} from '../../domain/services/narrative/narrativePromptBudget.js';
import {
  finalizeOperatorNarrativeSurface,
  buildProseFromClaims,
  isStubNarrative,
  resolveOperatorNarrativeCitations,
} from '../../domain/services/operator/operatorNarrativeSurface.js';

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

async function resolveFactsByComponent(activePlan, narrativeScored, registry, llmOpts, rag, epistemicBlock) {
  if (activePlan.useStubClaims || !isNarrativeFactsPassEnabled()) {
    return buildDigestStubClaims(narrativeScored, registry);
  }
  if (activePlan.factsEnabled === false) {
    return {};
  }
  return extractNarrativeFacts(narrativeScored, {
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

/**
 * @param {object} params
 * @returns {Promise<{ factsByComponent: object, mergedNarratives: object, judgeFeedback: string }|null>}
 */
async function executeFactsAttempts(params) {
  const {
    assessment, narrativeScored, registry, rag, llmOpts, epistemicBlock, activePlan,
  } = params;

  let factsByComponent = {};
  let mergedNarratives = { components: [] };
  let judgeFeedback = '';

  for (let attempt = 0; attempt < MAX_FACTS_ATTEMPTS; attempt += 1) {
    factsByComponent = await resolveFactsByComponent(
      activePlan, narrativeScored, registry, llmOpts, rag, epistemicBlock,
    );
    factsByComponent = supplementFactsWithDigestStubs(factsByComponent, registry);
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

  return { factsByComponent, mergedNarratives, judgeFeedback };
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

  let activePlan = plan;

  for (let overflowRetry = 0; overflowRetry <= MAX_OVERFLOW_RETRIES; overflowRetry += 1) {
    try {
      const result = await executeFactsAttempts({
        assessment, narrativeScored, registry, rag, llmOpts, epistemicBlock, activePlan,
      });
      if (!result) return null;
      return { ...result, plan: activePlan };
    } catch (err) {
      if (!isTokenOverflowError(err) || overflowRetry >= MAX_OVERFLOW_RETRIES) throw err;
      console.error(`[operator-narrative] Facts/judge token overflow — escalating budget (${err.message})`);
      activePlan = rebudgetPlan(activePlan, pipelineParams);
      if (activePlan.skipLlm) return null;
    }
  }
  return null;
}

function buildPolishFeedback(judgeFeedback, validationFeedback) {
  return [judgeFeedback, validationFeedback].filter(Boolean).join('\n\n');
}

function formatPolishValidationFeedback(validation, suppression) {
  return [
    formatValidationFeedback(validation),
    formatSuppressionFeedback(suppression),
  ].filter(Boolean).join('\n\n');
}

function buildOverflowFallbackPolish(activePlan) {
  return {
    components: [],
    cross_component_synthesis: '',
    pipelineDegrade: true,
    degradeReasons: ['narrative_context_overflow'],
    plan: activePlan,
  };
}

/**
 * @param {object} params
 * @returns {Promise<object>}
 */
async function executePolishAttempts(params) {
  const {
    mergedNarratives,
    registry,
    narrativeScored,
    rag,
    llmOpts,
    judgeFeedback,
    epistemicBlock,
    activePlan,
    degradeReasons,
  } = params;

  let polish = { components: [], cross_component_synthesis: '' };
  let validationFeedback = judgeFeedback;

  for (let attempt = 0; attempt < MAX_POLISH_ATTEMPTS; attempt += 1) {
    const feedback = buildPolishFeedback(judgeFeedback, validationFeedback);
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

    validationFeedback = formatPolishValidationFeedback(validation, suppression);

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

  const degradeReasons = [];
  if (judgeFeedback) {
    degradeReasons.push('Relation judge: unresolved after facts pass');
  }

  let activePlan = plan;

  for (let overflowRetry = 0; overflowRetry <= MAX_OVERFLOW_RETRIES; overflowRetry += 1) {
    try {
      return await executePolishAttempts({
        mergedNarratives,
        registry,
        narrativeScored,
        rag,
        llmOpts,
        judgeFeedback,
        epistemicBlock,
        activePlan,
        degradeReasons,
      });
    } catch (err) {
      if (!isTokenOverflowError(err) || overflowRetry >= MAX_OVERFLOW_RETRIES) throw err;
      console.error(`[operator-narrative] Polish token overflow — escalating budget (${err.message})`);
      activePlan = rebudgetPlan(activePlan, pipelineParams);
      if (activePlan.skipLlm) {
        return buildOverflowFallbackPolish(activePlan);
      }
    }
  }

  return buildOverflowFallbackPolish(activePlan);
}

/**
 * @param {object} comp
 * @param {object} leg
 * @param {object|null|undefined} groundingScores
 * @param {{ byLabel?: Map<string, object> }} registry
 * @param {string|null|undefined} reportDate
 */
function applyPolishLegToComponent(comp, leg, groundingScores, registry, reportDate) {
  const narrative = resolveOperatorNarrativeCitations(
    String(leg.narrative ?? '').trim(),
    registry,
    reportDate,
    comp.component_id,
    comp,
  );
  if (!narrative) return;

  comp.narrative_operator = narrative;
  comp.narrative_grounding_score = groundingScores?.byComponent?.[comp.component_id]?.score ?? null;

  if (Array.isArray(leg.evidence) && leg.evidence.length > 0) {
    comp.evidence_operator = leg.evidence;
  }

  if (leg.data_quality_caveat) {
    comp.data_quality_caveat = leg.data_quality_caveat;
  }

  if (Array.isArray(leg.narrative_claims) && leg.narrative_claims.length > 0) {
    comp.narrative_claims = leg.narrative_claims;
  }

  if (!legacyNarrativeOnly()) return;

  comp.narrative = narrative;
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
    mergedNarratives: factsResult.mergedNarratives,
    pipelineDegrade,
    degradeReasons,
    narrativeContextPlan: finalPlan ?? plan,
  };
}

function backfillOperatorNarrativeFromClaims(comp, mergedClaims, registry, assessment) {
  const hasOperatorNarrative = String(comp.narrative_operator ?? '').trim()
    && !isStubNarrative(comp.narrative_operator);
  const signalEntries = registry?.byComponent?.[comp.component_id] ?? [];
  if (hasOperatorNarrative || signalEntries.length === 0) return;

  const claims = comp.narrative_claims ?? mergedClaims;
  if (claims.length === 0) return;

  const prose = buildProseFromClaims(claims);
  if (!prose) return;

  comp.narrative_operator = resolveOperatorNarrativeCitations(
    prose,
    registry,
    assessment.date,
    comp.component_id,
    comp,
  );
  assessment.narrative_pipeline_degraded = true;
  assessment.narrative_pipeline_degrade_reasons = [
    ...(assessment.narrative_pipeline_degrade_reasons ?? []),
    'polish_miss_backfill',
  ];
}

/**
 * @param {object} comp
 * @param {Record<string, object>} polishById
 * @param {Record<string, object>} mergedById
 * @param {object|null|undefined} groundingScores
 * @param {object} registry
 * @param {object} assessment
 */
function applyNarrativeToAssessmentComponent(
  comp,
  polishById,
  mergedById,
  groundingScores,
  registry,
  assessment,
) {
  const leg = polishById[comp.component_id];
  if (leg?.narrative) {
    applyPolishLegToComponent(comp, leg, groundingScores, registry, assessment.date);
  } else if (Array.isArray(leg?.narrative_claims) && leg.narrative_claims.length > 0) {
    comp.narrative_claims = leg.narrative_claims;
  }

  const mergedClaims = mergedById[comp.component_id]?.narrative_claims ?? [];
  if (!comp.narrative_claims?.length && mergedClaims.length > 0) {
    comp.narrative_claims = mergedClaims;
  }

  backfillOperatorNarrativeFromClaims(comp, mergedClaims, registry, assessment);
}

function applyNarrativePipelineMetadata(assessment, pipelineResult, mode) {
  const { polish, narrativeContextPlan, registry, pipelineDegrade, degradeReasons } = pipelineResult;

  if (polish.cross_component_synthesis) {
    assessment.cross_component_synthesis_operator = resolveInlineSignalCitations(
      polish.cross_component_synthesis,
      registry,
      assessment.date,
    );
    if (legacyNarrativeOnly()) {
      assessment.cross_component_synthesis = assessment.cross_component_synthesis_operator;
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
  if (pipelineDegrade) {
    assessment.narrative_pipeline_degraded = true;
    assessment.narrative_pipeline_degrade_reasons = degradeReasons ?? [];
  }

  if (registry?.byLabel?.size) {
    assessment.narrative_citation_registry = {
      entries: [...registry.byLabel.entries()].map(([, entry]) => ({
        label: entry.label,
        ref: entry.ref,
        article_source: entry.signal?.article_source ?? null,
        article_url: entry.signal?.article_url ?? null,
        source_type: entry.signal?.source_type ?? null,
      })),
    };
  }
}

/**
 * Apply pipeline output to assessment (hybrid or legacy mode).
 * @param {object} assessment
 * @param {object} pipelineResult
 */
export function applyOperatorNarrativeToAssessment(assessment, pipelineResult) {
  if (!assessment || !pipelineResult?.polish) return assessment;

  const mode = resolveNarrativePipelineMode();
  const {
    polish,
    groundingScores,
    registry,
    mergedNarratives,
  } = pipelineResult;
  const polishById = Object.fromEntries(
    (polish.components ?? []).map((c) => [c.component_id, c]),
  );
  const mergedById = Object.fromEntries(
    (mergedNarratives?.components ?? []).map((c) => [c.component_id, c]),
  );

  for (const comp of assessment.components ?? []) {
    applyNarrativeToAssessmentComponent(
      comp,
      polishById,
      mergedById,
      groundingScores,
      registry,
      assessment,
    );
  }

  applyNarrativePipelineMetadata(assessment, pipelineResult, mode);
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
