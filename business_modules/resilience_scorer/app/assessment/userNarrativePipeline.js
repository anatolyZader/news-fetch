/**
 * Hybrid user narrative pipeline: RAG → facts → merge agent claims → judge → polish → validate.
 */
import { buildNarrativeRetrievalContext } from '../../infrastructure/narrativeRetrievalContext.js';
import { extractNarrativeFacts } from '../../infrastructure/narrativeFactsExtract.js';
import {
  judgeNarrativeRelations,
  formatJudgeFeedback,
} from '../../infrastructure/narrativeRelationJudge.js';
import { polishNarrativeFromClaims, repolishComponents } from '../../infrastructure/narrativePolish.js';
import { buildFullSignalDigest } from '../../domain/services/narrative/buildFullSignalDigest.js';
import {
  SCOPE_MARKER_PREFIX,
  checkComponentScopeSegregation,
  isContextDerivedClaim,
  isScopeGateEnabled,
  isScopeRepairEnabled,
} from '../../domain/services/narrativeGrounding/scopeSegregation.js';
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
  finalizeUserNarrativeSurface,
  buildProseFromClaims,
  isStubNarrative,
  resolveUserNarrativeCitations,
} from '../../domain/services/user/userNarrativeSurface.js';

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
 * Run an LLM pass, escalating the context budget on token overflow.
 * @param {object} opts
 * @param {object} opts.plan
 * @param {object} opts.pipelineParams
 * @param {string} opts.label — pass name used in overflow log lines
 * @param {(activePlan: object) => Promise<object|null>} opts.attempt
 * @param {(activePlan: object) => object|null} opts.overflowFallback — result when rebudget lands on skipLlm or retries are exhausted
 * @returns {Promise<object|null>}
 */
async function runWithOverflowRebudget({ plan, pipelineParams, label, attempt, overflowFallback }) {
  let activePlan = plan;

  for (let overflowRetry = 0; overflowRetry <= MAX_OVERFLOW_RETRIES; overflowRetry += 1) {
    try {
      return await attempt(activePlan);
    } catch (err) {
      if (!isTokenOverflowError(err) || overflowRetry >= MAX_OVERFLOW_RETRIES) throw err;
      console.error(`[user-narrative] ${label} token overflow — escalating budget (${err.message})`);
      activePlan = rebudgetPlan(activePlan, pipelineParams);
      if (activePlan.skipLlm) return overflowFallback(activePlan);
    }
  }
  return overflowFallback(activePlan);
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

async function resolveFactsByComponent(
  activePlan, narrativeScored, registry, llmOpts, rag, epistemicBlock, feedback = '',
) {
  if (activePlan.useStubClaims || !isNarrativeFactsPassEnabled()) {
    return buildDigestStubClaims(registry);
  }
  if (activePlan.factsEnabled === false) {
    return {};
  }
  return extractNarrativeFacts(narrativeScored, {
    ...llmOpts,
    retrievedSpansBlock: rag.block,
    epistemicBlock,
    feedback,
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
      activePlan, narrativeScored, registry, llmOpts, rag, epistemicBlock, judgeFeedback,
    );
    factsByComponent = supplementFactsWithDigestStubs(factsByComponent, registry);
    mergedNarratives = mergeAgentClaimsWithFacts(assessment, factsByComponent);
    if (!(mergedNarratives.components ?? []).some((c) => (c.narrative_claims ?? []).length > 0)) {
      return null;
    }

    if (activePlan.judgeEnabled === false || !isNarrativeJudgeEnabled()) break;

    const judgeResult = await judgeNarrativeRelations(mergedNarratives, registry, llmOpts);
    if (judgeResult.ok) {
      // A later attempt that converges must not leave the earlier rejection behind:
      // downstream treats a non-empty judgeFeedback as "unresolved" and degrades on it.
      judgeFeedback = '';
      break;
    }
    judgeFeedback = formatJudgeFeedback(judgeResult.failures);
    if (attempt >= MAX_FACTS_ATTEMPTS - 1) {
      console.error(`[user-narrative] Relation judge failures after ${MAX_FACTS_ATTEMPTS} attempts`);
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

  return runWithOverflowRebudget({
    plan,
    pipelineParams,
    label: 'Facts/judge',
    attempt: async (activePlan) => {
      const result = await executeFactsAttempts({
        assessment, narrativeScored, registry, rag, llmOpts, epistemicBlock, activePlan,
      });
      if (!result) return null;
      return { ...result, plan: activePlan };
    },
    overflowFallback: () => null,
  });
}

function buildPolishFeedback(judgeFeedback, validationFeedback) {
  return [judgeFeedback, validationFeedback].filter(Boolean).join('\n\n');
}

function formatPolishValidationFeedback(validation) {
  return formatValidationFeedback(validation);
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
  // Seeded empty, not from judgeFeedback: buildPolishFeedback already prepends the
  // judge block, so seeding it here repeated the whole block verbatim on attempt 0.
  let validationFeedback = '';

  // What we ASKED polish for. The validator needs this to notice a component that
  // never came back; deriving it from the output can only ever confirm what is
  // already there.
  const requestedComponentIds = new Set(
    (mergedNarratives.components ?? [])
      .filter((c) => (c.narrative_claims ?? []).length > 0)
      .map((c) => c.component_id),
  );

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
      requestedComponentIds,
    });

    if (validation.ok) break;

    if (polishResult.stopReason === 'max_tokens' && attempt < MAX_POLISH_ATTEMPTS - 1) {
      console.error('[user-narrative] Polish truncated at max_tokens; skipping costly validation retry');
      break;
    }

    validationFeedback = formatPolishValidationFeedback(validation);

    if (attempt >= MAX_POLISH_ATTEMPTS - 1) {
      console.error('[user-narrative] Validation failed after polish retries; applying best-effort output');
      degradeReasons.push('Narrative validation: exhausted after polish retries');
    }
  }

  const scopeRepairs = await repairScopeViolations({
    polish,
    mergedNarratives,
    registry,
    narrativeScored,
    rag,
    llmOpts,
    epistemicBlock,
    activePlan,
    degradeReasons,
  });

  const polishOutput = { ...polish, scopeRepairs };
  delete polishOutput.stopReason;
  return {
    ...polishOutput,
    pipelineDegrade: degradeReasons.length > 0,
    degradeReasons,
    plan: activePlan,
  };
}

/**
 * Name the refs a component must move behind the scope marker.
 *
 * @param {object[]} claims
 * @param {object} registry
 * @returns {string}
 */
function formatScopeRepairFeedback(componentId, claims, registry) {
  const contextRefs = (claims ?? [])
    .filter((c) => isContextDerivedClaim(c, registry))
    .flatMap((c) => c.signal_refs ?? []);
  return `Scope violation in ${componentId}: these refs rest entirely on evidence from `
    + `outside the report scope — ${[...new Set(contextRefs)].join(', ')}. `
    + `Rewrite ${componentId} so every statement resting on them appears ONLY in trailing `
    + `sentences that begin verbatim with "${SCOPE_MARKER_PREFIX}". `
    + 'Local findings must not depend on those refs. Keep all other content unchanged.';
}

/**
 * Give a component whose prose broke scope segregation one targeted re-ask.
 *
 * Discarding the whole narrative on a single misplaced sentence is what left
 * north 2026-04-03 with deterministic claim-stack prose in three components that
 * had perfectly good analysis behind them. Repair first; the discard in
 * enforceScopeSegregation remains as the backstop for anything still violating.
 *
 * @param {object} params
 * @returns {Promise<string[]>} component ids whose prose was successfully repaired
 */
async function repairScopeViolations(params) {
  const {
    polish, mergedNarratives, registry, narrativeScored, rag, llmOpts, epistemicBlock,
    activePlan, degradeReasons,
  } = params;
  if (!isScopeGateEnabled() || !isScopeRepairEnabled()) return [];

  const violating = (polish.components ?? []).filter((leg) => {
    if (!String(leg?.narrative ?? '').trim()) return false;
    const claims = leg.narrative_claims
      ?? mergedNarratives.components?.find((c) => c.component_id === leg.component_id)?.narrative_claims
      ?? [];
    return !checkComponentScopeSegregation({ prose: leg.narrative, claims, registry }).ok;
  });
  if (violating.length === 0) return [];

  const repairedIds = [];
  for (const leg of violating) {
    const claims = leg.narrative_claims
      ?? mergedNarratives.components?.find((c) => c.component_id === leg.component_id)?.narrative_claims
      ?? [];
    let repaired = null;
    try {
      const result = await repolishComponents({
        mergedNarratives,
        registry,
        narrativeScored,
        componentIds: [leg.component_id],
        feedback: formatScopeRepairFeedback(leg.component_id, claims, registry),
        opts: {
          ...llmOpts,
          retrievedSpansBlock: rag.block,
          epistemicBlock,
          skipProgress: false,
          promptBudget: {
            section: 'narrative_polish',
            degrade_level: activePlan.degradeLevel,
            estimated_input_tokens: activePlan.section_estimates?.worst_polish_shard,
          },
        },
        progressLabel: `[Step 3 — Polish scope repair ${leg.component_id}]`,
      });
      repaired = result.components[0] ?? null;
    } catch (err) {
      console.error(`[user-narrative] Scope repair failed for ${leg.component_id} (${err.message})`);
    }

    const stillViolating = !repaired
      || !String(repaired.narrative ?? '').trim()
      || !checkComponentScopeSegregation({
        prose: repaired.narrative,
        claims: repaired.narrative_claims ?? claims,
        registry,
      }).ok;

    if (stillViolating) {
      degradeReasons.push(`scope_repair_failed:${leg.component_id}`);
      continue;
    }
    leg.narrative = repaired.narrative;
    if (Array.isArray(repaired.evidence) && repaired.evidence.length > 0) {
      leg.evidence = repaired.evidence;
    }
    if (Array.isArray(repaired.narrative_claims) && repaired.narrative_claims.length > 0) {
      leg.narrative_claims = repaired.narrative_claims;
    }
    repairedIds.push(leg.component_id);
  }
  return repairedIds;
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

  return runWithOverflowRebudget({
    plan,
    pipelineParams,
    label: 'Polish',
    attempt: (activePlan) => executePolishAttempts({
      mergedNarratives,
      registry,
      narrativeScored,
      rag,
      llmOpts,
      judgeFeedback,
      epistemicBlock,
      activePlan,
      degradeReasons,
    }),
    overflowFallback: buildOverflowFallbackPolish,
  });
}

/**
 * @param {object} comp
 * @param {object} leg
 * @param {object|null|undefined} groundingScores
 * @param {{ byLabel?: Map<string, object> }} registry
 * @param {string|null|undefined} reportDate
 */
function applyPolishLegToComponent(comp, leg, groundingScores, registry, reportDate) {
  const narrative = resolveUserNarrativeCitations(
    String(leg.narrative ?? '').trim(),
    registry,
    reportDate,
    comp.component_id,
    comp,
  );
  if (!narrative) return;

  comp.narrative_user = narrative;

  // The checker already returns issues and an interpretive verdict; keeping only
  // the number is how a report full of ungrounded prose looked identical to a
  // clean one. Write all three.
  const grounding = groundingScores?.byComponent?.[comp.component_id] ?? null;
  comp.narrative_grounding_score = grounding?.score ?? null;
  if (Array.isArray(grounding?.issues)) comp.grounding_issues = grounding.issues;
  if (grounding?.interpretive_summary != null) {
    comp.interpretive_summary = grounding.interpretive_summary;
  }

  if (Array.isArray(leg.evidence) && leg.evidence.length > 0) {
    comp.evidence_user = leg.evidence;
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
export async function runUserNarrativePipeline(params) {
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

  const quarantineBlock = formatDigitalQuarantineNarrativeBlock({
    quarantinedDigital,
    scoringPartition,
    narrativeScopeSignalCount: narrativeScopeSignals.length,
    signalsScoringUsed: signalsScoringUsed ?? scoringPartition?.scoringSignals?.length ?? 0,
  });
  const anchorBlock = reportDate
    ? `Assessment anchor date: ${reportDate}. Field-visit evidence lines show the visit date and its age; `
      + 'weight older field evidence progressively less and state the visit date when citing it.'
    : '';
  const epistemicBlock = [anchorBlock, quarantineBlock].filter(Boolean).join('\n\n');

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

  // Polish is the last stage and the only one on Sonnet, so it is the most likely
  // to die on a transport fault. Letting it throw used to discard the whole run —
  // north 2026-04-02 shipped 0 claims across all 8 components because a mid-response
  // disconnect in polish threw away a facts/judge pass that had already succeeded.
  // Keep the judged claims; backfillUserNarrativeFromClaims renders prose from them.
  let polishResult;
  try {
    polishResult = await runPolishAndValidatePass({
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
  } catch (err) {
    console.error(`[user-narrative] Polish failed (${err.message}); keeping judged claims`);
    polishResult = {
      components: [],
      cross_component_synthesis: '',
      pipelineDegrade: true,
      degradeReasons: [`Narrative polish: failed (${err.message})`],
      plan,
    };
  }
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

/**
 * Stamp user_epistemic_role onto claims for the deterministic fallback.
 *
 * buildDeterministicNarrativeFromClaims sections prose by this field, but claims
 * come out of normalizeClaims carrying only text/signal_refs/relation — so every
 * claim landed in one unsectioned bucket and the fallback read as a flat stack of
 * quotes (north 2026-04-03: all 64 claims had a null role).
 *
 * Only `context_only` is assigned, and only from isContextDerivedClaim — the same
 * "every ref is out of scope" test the scope gate uses, so the two agree by
 * construction. Local claims are left unset and inherit the builder's
 * `investigation_only` default: the scoring/quarantine sets that would separate
 * `scored` from `investigation_only` are not built until attachRichUserSurface,
 * which runs after this pipeline, and both render without a prefix anyway.
 *
 * @param {object[]} claims
 * @param {object} registry
 * @returns {object[]}
 */
export function claimsWithEpistemicRoles(claims, registry) {
  if (!registry) return claims;
  return claims.map((claim) => {
    if (claim?.user_epistemic_role) return claim;
    return isContextDerivedClaim(claim, registry)
      ? { ...claim, user_epistemic_role: 'context_only' }
      : claim;
  });
}

function backfillUserNarrativeFromClaims(comp, mergedClaims, registry, assessment) {
  const hasUserNarrative = String(comp.narrative_user ?? '').trim()
    && !isStubNarrative(comp.narrative_user);
  const signalEntries = registry?.byComponent?.[comp.component_id] ?? [];
  if (hasUserNarrative || signalEntries.length === 0) return;

  const claims = comp.narrative_claims ?? mergedClaims;
  if (claims.length === 0) return;

  const prose = buildProseFromClaims(claimsWithEpistemicRoles(claims, registry));
  if (!prose) return;

  comp.narrative_user = resolveUserNarrativeCitations(
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
/**
 * Enforce scope segregation on generated prose.
 *
 * The polish prompt asks for out-of-scope evidence to be segregated behind a
 * marker sentence; asking was not enough — north 2026-04-02 complied in 0 of 8
 * components and wrote an Ashdod/Ashkelon early-warning failure as a northern
 * finding. On violation the LLM prose is discarded and the component falls back
 * to deterministic claim prose, with context claims pushed last behind the
 * marker so the fallback is compliant by construction.
 *
 * This is the backstop, not the first response: repairScopeViolations already
 * gave the component one targeted re-ask during polish. Discarding on the first
 * misplaced sentence is what left north 2026-04-03 with claim-stack prose in
 * three components whose analysis was sound.
 *
 * Per-component: one bad component does not cost the others their narrative.
 */
function enforceScopeSegregation(comp, registry, assessment) {
  if (!isScopeGateEnabled()) return;
  const claims = comp.narrative_claims ?? [];
  const check = checkComponentScopeSegregation({
    prose: comp.narrative_user,
    claims,
    registry,
  });
  if (check.ok) return;

  const local = claims.filter((c) => !isContextDerivedClaim(c, registry));
  const context = claims
    .filter((c) => isContextDerivedClaim(c, registry))
    .map((c) => ({ ...c, text: `${SCOPE_MARKER_PREFIX} ${String(c.text ?? '').trim()}` }));
  comp.narrative_claims = [...local, ...context];
  comp.narrative_user = '';

  assessment.narrative_pipeline_degraded = true;
  assessment.narrative_pipeline_degrade_reasons = [
    ...(assessment.narrative_pipeline_degrade_reasons ?? []),
    ...check.violations,
  ];
}

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

  // Before the backfill, so a rejected narrative is rebuilt from claims below.
  enforceScopeSegregation(comp, registry, assessment);

  backfillUserNarrativeFromClaims(comp, mergedClaims, registry, assessment);
}

function applyNarrativePipelineMetadata(assessment, pipelineResult, mode) {
  const { polish, narrativeContextPlan, registry, pipelineDegrade, degradeReasons } = pipelineResult;

  if (polish.cross_component_synthesis) {
    assessment.cross_component_synthesis_user = resolveInlineSignalCitations(
      polish.cross_component_synthesis,
      registry,
      assessment.date,
    );
    if (legacyNarrativeOnly()) {
      assessment.cross_component_synthesis = assessment.cross_component_synthesis_user;
    }
  }

  if (polish.scopeRepairs?.length) {
    assessment.narrative_scope_repairs = [...polish.scopeRepairs];
  }

  assessment.narrative_pipeline_mode = mode;
  if (narrativeContextPlan) {
    assessment.narrative_prompt_budget = {
      degrade_level: narrativeContextPlan.degradeLevel,
      section_estimates: narrativeContextPlan.section_estimates,
      registry_count: narrativeContextPlan.registry?.refCount ?? 0,
      digest_cap: narrativeContextPlan.digestCap,
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
        signal_date: entry.signal?.visit_date ?? null,
      })),
    };
  }
}

/**
 * Apply pipeline output to assessment (hybrid or legacy mode).
 * @param {object} assessment
 * @param {object} pipelineResult
 */
export function applyUserNarrativeToAssessment(assessment, pipelineResult) {
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
export async function applyUserNarrativePipeline(params) {
  const { assessment } = params;
  if (!hybridNarrativeEnabled() && !legacyNarrativeOnly()) {
    assessment.narrative_pipeline_mode = resolveNarrativePipelineMode();
    return finalizeUserNarrativeSurface(assessment);
  }

  try {
    const result = await runUserNarrativePipeline(params);
    if (result) {
      applyUserNarrativeToAssessment(assessment, result);
    }
  } catch (err) {
    console.error(`[user-narrative] Pipeline failed (${err.message}); keeping score shell`);
    // Fail-open is deliberate — the score shell still ships. But a report that
    // lost its entire narrative layer used to say so only on stderr: north
    // 2026-04-01 shipped 284 scoped signals, a 424-item investigation pool and
    // zero claims while still serializing `assessment_degraded: null`. Only
    // token overflow set the flag; every other throw was silent.
    assessment.narrative_pipeline_degraded = true;
    assessment.narrative_pipeline_degrade_reasons = [
      ...(assessment.narrative_pipeline_degrade_reasons ?? []),
      isTokenOverflowError(err) ? 'narrative_context_overflow' : 'narrative_pipeline_error',
    ];
    assessment.narrative_pipeline_error = { message: err.message };
  }

  return finalizeUserNarrativeSurface(assessment);
}
