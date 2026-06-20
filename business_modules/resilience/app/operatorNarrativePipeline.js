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
import { mergeAgentClaimsWithFacts } from '../domain/services/buildNarrativeScoredComponents.js';
import {
  buildSignalRefRegistry,
  validateNarrativeOutput,
  formatValidationFeedback,
  computeGroundingScores,
  validateSuppressionCompliance,
  formatSuppressionFeedback,
  isNarrativeFactsPassEnabled,
  isNarrativeJudgeEnabled,
  hybridNarrativeEnabled,
  legacyNarrativeOnly,
  resolveNarrativePipelineMode,
  formatDigitalQuarantineNarrativeBlock,
} from '../domain/services/narrativeGrounding/index.js';
import { finalizeOperatorNarrativeSurface } from '../domain/services/operatorNarrativeSurface.js';

const MAX_FACTS_ATTEMPTS = 2;
const MAX_POLISH_ATTEMPTS = 2;

/**
 * @param {object} params
 * @returns {Promise<{ factsByComponent: object, mergedNarratives: object, judgeFeedback: string }|null>}
 */
async function runFactsAndJudgePass(params) {
  const { assessment, narrativeScored, registry, rag, llmOpts, epistemicBlock } = params;
  let factsByComponent = {};
  let mergedNarratives = { components: [] };
  let judgeFeedback = '';

  for (let attempt = 0; attempt < MAX_FACTS_ATTEMPTS; attempt += 1) {
    if (isNarrativeFactsPassEnabled()) {
      factsByComponent = await extractNarrativeFacts(narrativeScored, {
        ...llmOpts,
        retrievedSpansBlock: rag.block,
        epistemicBlock,
      });
    }

    mergedNarratives = mergeAgentClaimsWithFacts(assessment, factsByComponent);
    if (!(mergedNarratives.components ?? []).some((c) => (c.narrative_claims ?? []).length > 0)) {
      return null;
    }

    if (!isNarrativeJudgeEnabled()) break;

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
  } = params;

  let polish = { components: [], cross_component_synthesis: '' };
  let validationFeedback = judgeFeedback;

  for (let attempt = 0; attempt < MAX_POLISH_ATTEMPTS; attempt += 1) {
    const feedback = [judgeFeedback, validationFeedback].filter(Boolean).join('\n\n');
    polish = await polishNarrativeFromClaims(
      mergedNarratives,
      registry,
      narrativeScored,
      { ...llmOpts, retrievedSpansBlock: rag.block, feedback, epistemicBlock, skipProgress: false },
    );

    const validation = validateNarrativeOutput(polish, {
      scoredComponents: narrativeScored,
      registry,
    });
    const suppression = validateSuppressionCompliance(polish, narrativeScored);

    if (validation.ok && suppression.ok) break;

    validationFeedback = [
      formatValidationFeedback(validation),
      formatSuppressionFeedback(suppression),
    ].filter(Boolean).join('\n\n');

    if (attempt >= MAX_POLISH_ATTEMPTS - 1) {
      console.error('[operator-narrative] Validation failed after polish retries; applying best-effort output');
    }
  }

  return polish;
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
  } = params;

  if (!assessment || !Array.isArray(narrativeScopeSignals) || narrativeScopeSignals.length === 0) {
    return null;
  }

  const scoringContext = narrativeScoringContext ?? scoredFull;
  const narrativeScored = buildFullSignalDigest(narrativeScopeSignals, scoringContext);
  const registry = buildSignalRefRegistry(narrativeScored);
  if (registry.refCount === 0) return null;

  const epistemicBlock = formatDigitalQuarantineNarrativeBlock({
    quarantinedDigital,
    scoringPartition,
    narrativeScopeSignalCount: narrativeScopeSignals.length,
    signalsScoringUsed: signalsScoringUsed ?? scoringPartition?.scoringSignals?.length ?? 0,
  });

  const llmOpts = { onUsage, llmPort };
  const rag = await buildNarrativeRetrievalContext(narrativeScored, {
    retrievalService,
    reportDate,
  });

  const factsResult = await runFactsAndJudgePass({
    assessment,
    narrativeScored,
    registry,
    rag,
    llmOpts,
    epistemicBlock,
  });
  if (!factsResult) return null;

  const polish = await runPolishAndValidatePass({
    mergedNarratives: factsResult.mergedNarratives,
    registry,
    narrativeScored,
    rag,
    llmOpts,
    judgeFeedback: factsResult.judgeFeedback,
    epistemicBlock,
  });

  const groundingScores = computeGroundingScores(polish, narrativeScored, registry);
  return {
    polish,
    groundingScores,
    narrativeScored,
    registry,
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
  const { polish, groundingScores } = pipelineResult;
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
    console.error(`[operator-narrative] Pipeline failed (${err.message}); keeping agent narratives`);
  }

  return assessment;
}
