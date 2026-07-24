/**
 * Component specialist agent — bounded tool loop per resilience component.
 *
 * **Owns:** per-component LLM investigation with multi-hop retrieval tools, adversarial
 * retrieval policy, tier A/B/C depth, critic-facing submit payload, and seeded-claim fallback.
 *
 * **Pipeline position:** invoked once per component (or abstention stub) from
 * `assessmentOrchestrator.runAllComponentAssessments`.
 *
 * **Inputs:** component id, epistemic slice, evidence graph, assigned/gap-closure tasks, tier.
 *
 * **Outputs:** component assessment (`claims`, `narrative`, `retrieval_gaps`, `specialist_depth`).
 *
 * **Does NOT:** plan cross-component investigation or write final report JSON.
 *
 * **Collaborators:** `cross-cut-modules/agent` (kernel, tools profile), `multiHopRetrieval`,
 * `narrativeTemplates`, `contestedRetrievalPolicy`, `specialistTier`.
 */
import {
  createAgentKernel,
  resolveModelForStage,
  slimPromptsEnabled,
  compressToolsEnabled,
} from '../../../cross-cut-modules/agent/index.js';
import {
  SPECIALIST_TOOLS,
  ASSESSMENT_SPECIALIST_PROFILE,
} from '../../../cross-cut-modules/agent/profiles/assessment.profile.js';
import { executeMultiHopTool, LOOKUP_TOOL_NAMES, MULTI_HOP_TOOL_NAMES } from '../../../cross-cut-modules/retrieval/multiHopRetrieval.js';
import { compactComponentGraph, compactEpistemicSlice } from '../../../cross-cut-modules/retrieval/compactEvidenceGraph.js';
import { maxRoundsForTier } from '../domain/services/specialistTier.js';
import {
  requiresAdversarialRetrieval,
  trackAdversarialRetrieval,
  validateAdversarialBeforeSubmit,
  adversarialSystemHint,
} from '../domain/services/contestedRetrievalPolicy.js';
import { shouldAbstainFromInvestigation } from '../domain/services/investigationEpistemic.js';
import { narrativeInvestigationPermissive } from '../../resilience_scorer/index.js';
import {
  buildComponentNarrative,
  buildOperatorQualitativeNarrative,
  buildAbstentionNarrative,
  INSUFFICIENT_SYNTHESIS_NARRATIVE,
  shouldAllowTemplateNarrative,
} from '../domain/services/narrativeTemplates.js';

/** Investigation abstention opts (narrative permissive when env allows thin evidence). */
function investigationAbstentionOpts() {
  return { narrativePermissive: narrativeInvestigationPermissive() };
}

/**
 * Build stable+dynamic system prompt blocks for specialist (exported for tests).
 *
 * @returns {{ stable: string, dynamic: string }}
 */
function buildSpecialistSystem(componentId, epistemicProfile, evidenceGraph, assignedTasks = [], specialistTier = 'A', narrativePermissive = false) {
  const compGraph = evidenceGraph?.by_component?.[componentId] ?? {};
  const compEp = epistemicProfile?.by_component?.[componentId] ?? {};
  const taskBlock = assignedTasks.length
    ? `\nASSIGNED INVESTIGATION TASKS:\n${JSON.stringify(assignedTasks, null, 2)}\n`
    : '';

  const useCompact = slimPromptsEnabled();
  const epBlock = useCompact
    ? JSON.stringify(compactEpistemicSlice(compEp), null, 2)
    : JSON.stringify(compEp, null, 2);
  const graphBlock = useCompact
    ? JSON.stringify(compactComponentGraph(compGraph), null, 2)
    : JSON.stringify(compGraph, null, 2);

  const compactHint = useCompact
    ? '\nUse get_source(source_id) or lookup_signals for verbatim evidence.\n'
    : '';

  const tierBHint = specialistTier === 'B'
    ? '\nPrefer submitting from seeded claims; minimal retrieval unless a gap task requires it.\n'
    : '';

  const permissiveHint = narrativePermissive
    ? '\nNarrative mode permissive: summarize all investigation-pool signals even if scoring epistemics are thin; mark uncertainty as provisional in the narrative — do not abstain solely for thin_evidence.\n'
    : '';

  const stable =
    `You assess resilience component "${componentId}". ` +
    'Tool order: use retrieve_for_claim, cross_source_compare, or expand_source_neighborhood FIRST; ' +
    'then lookup_signals to verify catalog refs; use get_source for verbatim quotes. ' +
    'Submit via submit_component_assessment. Every claim MUST have evidence_refs. ' +
    'Write the narrative as concise, operator-readable English prose that summarizes the evidence; ' +
    'when evidence_refs include URLs, each factual sentence must include an inline markdown citation [source_label](url) using article_source or source type as the label. ' +
    'Put verbatim quotes only in evidence_refs and never paste raw or multi-language evidence text into the narrative. ' +
    'If evidence carries narrativeContextOnly or signalProvenance narrative_national_context / macro_national / regional_press_context, use it for narrative context only — never treat it as scope-local scored evidence. ' +
    'When citing regional_press_context, prefix with "Regional press (not north-local scored evidence):". ' +
    'When citing national press, explain how national or homefront dynamics (shelter norms, economic spillover, leadership messaging, national mood) may affect northern residents; prefix such sentences with phrasing like "National press (not north-local evidence):" and include inline citations. ' +
    'If thin_evidence, set severity low and confidence low, still synthesize available investigation-pool signals with provisional caveats — abstain only when there are zero claims.\n' +
    'For retrieval gaps, add attempted: entries when you tried to close them.\n' +
    compactHint +
    tierBHint +
    permissiveHint +
    adversarialSystemHint(compEp);

  const exposure = epistemicProfile?.assessment_epistemic?.exposure_context;
  const exposureBlock = exposure?.total_exposure_signals
    ? `\n\nEXPOSURE CONTEXT (current-day stressor counts — interpret component evidence relative to this pressure):\n${JSON.stringify(exposure)}`
    : '';

  const dynamic =
    `\nEPISTEMIC HINTS:\n${epBlock}\n\n` +
    `EVIDENCE GRAPH:\n${graphBlock}` +
    exposureBlock +
    taskBlock;

  return { stable, dynamic };
}

function assignSpecialistDepth(assessment, depth) {
  assessment.specialist_depth = depth;
  assessment.specialist_tier = depth;
}

/** Tier-C / explicit abstain: template narrative without tool loop. */
function abstentionAssessment(componentId, epistemicProfile, traceId, specialistDepth = 'C') {
  const ep = epistemicProfile?.by_component?.[componentId] ?? {};
  const out = {
    component_id: componentId,
    severity: 'abstain',
    confidence: 'low',
    operator_status: 'insufficient_data',
    claims: [],
    narrative: buildAbstentionNarrative(componentId, ep),
    dissent_summary: '',
    retrieval_gaps: [`need more evidence for ${componentId}`],
    reasoning_trace_id: traceId,
    evidence_tree: [],
    specialist_ran: false,
  };
  assignSpecialistDepth(out, specialistDepth);
  return out;
}

function seededClaimCount(evidenceGraph, componentId) {
  return (evidenceGraph?.by_component?.[componentId]?.claims ?? []).length;
}

function resolveSubmittedAssessment(result, assessment) {
  const submitted = result.submitPayloads.find((p) => p.tool === 'submit_component_assessment');
  return {
    submitted,
    assessment: submitted?.payload ?? assessment,
  };
}

/**
 * Run specialist tool loop for one component (or return abstention/fallback assessment).
 *
 * @param {object} params
 * @param {string} params.componentId
 * @param {object} params.epistemicProfile
 * @param {object} params.evidenceGraph
 * @param {boolean} [params.abstain=false]
 * @param {'A'|'B'|'C'} [params.specialistTier='A']
 * @returns {Promise<object>} component assessment payload
 * @sideEffects LLM tool rounds; multi-hop retrieval against archive/report namespaces
 */
export async function runComponentSpecialist(params) {
  const {
    componentId,
    epistemicProfile,
    evidenceGraph,
    multiHop,
    llmPort,
    agentKernel,
    onUsage,
    budget,
    escalate = false,
    abstain = false,
    traceId,
    assignedTasks = [],
    gapClosureTasks = [],
    specialistTier = 'A',
  } = params;

  const tier = specialistTier;
  const narrativePermissive = narrativeInvestigationPermissive();
  const abstentionOpts = investigationAbstentionOpts();

  if (abstain || tier === 'C') {
    return abstentionAssessment(componentId, epistemicProfile, traceId, tier);
  }

  const ep = epistemicProfile?.by_component?.[componentId] ?? {};
  if (!abstain && shouldAbstainFromInvestigation(ep, abstentionOpts) && tier !== 'A') {
    return abstentionAssessment(componentId, epistemicProfile, traceId, tier);
  }

  const shouldEscalate = escalate || Boolean(ep.presence_gate_triggered);

  const kernel = agentKernel ?? createAgentKernel({ llmPort });
  const model = resolveModelForStage('specialist', {
    escalate: shouldEscalate,
    salienceCritical: ep.salience_critical,
    presenceGate: ep.presence_gate_triggered,
  });

  let assessment = null;
  const toolUsage = { multiHop: 0, lookup: 0 };
  const toolCtx = {
    multiHop,
    epistemicProfile,
    reportDate: params.reportDate,
    signals: params.signals ?? [],
    sourceArchive: params.sourceArchive ?? null,
    evidenceStore: params.evidenceStore ?? null,
    traceStore: kernel.traceStore ?? null,
    traceId: `${traceId}:${componentId}`,
    agentKind: `specialist:${componentId}`,
    compressTools: compressToolsEnabled(),
    toolCompressEscalated: tier === 'A' || shouldEscalate,
    adversarialRetrievalRequired: requiresAdversarialRetrieval(ep, tier),
    adversarialRetrievalDone: false,
  };

  const allTasks = [...assignedTasks, ...gapClosureTasks];
  const userContent = allTasks.length
    ? `Assess component ${componentId} with evidence-backed claims. Assigned tasks: ${JSON.stringify(allTasks)}`
    : `Assess component ${componentId} with evidence-backed claims.`;

  const system = buildSpecialistSystem(componentId, epistemicProfile, evidenceGraph, allTasks, tier, narrativePermissive);

  const executeTool = async (name, input) => {
    if (name === 'submit_component_assessment') {
      const advErr = validateAdversarialBeforeSubmit(toolCtx);
      if (advErr) return advErr;
      assessment = { ...input, reasoning_trace_id: `${traceId}:${componentId}` };
      return JSON.stringify({ ok: true });
    }
    trackAdversarialRetrieval(toolCtx, name, input);
    if (MULTI_HOP_TOOL_NAMES.has(name)) toolUsage.multiHop += 1;
    if (LOOKUP_TOOL_NAMES.has(name)) toolUsage.lookup += 1;
    return executeMultiHopTool(name, input, toolCtx);
  };

  let result = await kernel.run({
    profile: ASSESSMENT_SPECIALIST_PROFILE,
    agentKind: `specialist:${componentId}`,
    model,
    maxRounds: maxRoundsForTier(tier),
    maxTokens: 3000,
    system,
    messages: [{ role: 'user', content: userContent }],
    tools: SPECIALIST_TOOLS,
    budget,
    traceId: `${traceId}:${componentId}`,
    onUsage,
    executeTool,
  });

  let { submitted, assessment: resolved } = resolveSubmittedAssessment(result, assessment);
  assessment = resolved;

  const seededCount = seededClaimCount(evidenceGraph, componentId);
  if (!submitted && seededCount > 0) {
    toolCtx.toolCompressEscalated = true;
    result = await kernel.run({
      profile: ASSESSMENT_SPECIALIST_PROFILE,
      agentKind: `specialist:${componentId}`,
      model,
      maxRounds: maxRoundsForTier('A'),
      maxTokens: 3000,
      system,
      messages: [{
        role: 'user',
        content:
          `Assess component ${componentId}. Seeded claims exist — you MUST call submit_component_assessment ` +
          'with evidence-backed claims and a synthesized narrative before ending.',
      }],
      tools: SPECIALIST_TOOLS,
      budget,
      traceId: `${traceId}:${componentId}:retry`,
      onUsage,
      executeTool,
    });
    ({ submitted, assessment: resolved } = resolveSubmittedAssessment(result, assessment));
    assessment = resolved;
  }

  if (!assessment) {
    assessment = buildFallbackAssessment(componentId, evidenceGraph, epistemicProfile, traceId);
  }

  if (!submitted && seededCount > 0) {
    assessment.specialist_submit_missing = true;
  }

  assessment.evidence_tree = assessment.claims ?? [];
  assessment.tool_usage = toolUsage;
  assessment.gap_closure_tasks = gapClosureTasks;
  assignSpecialistDepth(assessment, tier);
  assessment.specialist_ran = true;
  return assessment;
}

/**
 * Deterministic assessment from seeded graph claims when specialist fails to submit.
 * @exports via named export for tests
 */
function buildFallbackAssessment(componentId, evidenceGraph, epistemicProfile, traceId) {
  const graph = evidenceGraph?.by_component?.[componentId];
  const claims = (graph?.claims ?? []).map((c) => ({
    claim_id: c.claim_id,
    text: c.text,
    evidence_refs: [...(c.support ?? []), ...(c.contradict ?? [])].map((x) => x.ref).filter(Boolean),
    polarity: 'support',
    grounding_tier: 'grounded',
  }));
  const ep = epistemicProfile?.by_component?.[componentId] ?? {};
  const investigationUsed = ep.investigation_used ?? ep.signal_count ?? claims.length;
  let narrative;
  if (claims.length > 0) {
    const claimTexts = claims.map((c) => String(c.text ?? '').trim()).filter(Boolean).slice(0, 3);
    narrative = claimTexts.length > 1
      ? claimTexts.join(' Separately, ')
      : (claimTexts[0] ?? buildOperatorQualitativeNarrative({ componentId, ep }));
  } else if (investigationUsed >= 5 || !shouldAllowTemplateNarrative(ep, claims.length)) {
    narrative = INSUFFICIENT_SYNTHESIS_NARRATIVE;
  } else {
    narrative = buildComponentNarrative({ componentId, ep, claimCount: claims.length });
  }
  const thinAbstain = ep.thin_evidence === true && claims.length === 0;
  let operatorStatus = 'stable';
  if (thinAbstain) {
    operatorStatus = 'insufficient_data';
  } else if (ep.thin_evidence) {
    operatorStatus = 'provisional';
  }
  return {
    component_id: componentId,
    severity: thinAbstain ? 'abstain' : 'moderate',
    confidence: ep.certainty_band === 'high' ? 'medium' : 'low',
    operator_status: operatorStatus,
    claims,
    narrative,
    dissent_summary: ep.contested ? 'Evidence appears contested across sources.' : '',
    retrieval_gaps: graph?.retrieval_gaps ?? [],
    reasoning_trace_id: `${traceId}:${componentId}`,
    evidence_tree: claims,
  };
}

export { buildFallbackAssessment, buildSpecialistSystem };
