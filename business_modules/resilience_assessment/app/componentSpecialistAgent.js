/**
 * Component specialist agent — bounded tool loop per component.
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
import { shouldAbstainFromInvestigation } from '../../epistemic_features/domain/services/investigationEpistemic.js';

function buildSpecialistSystem(componentId, epistemicProfile, evidenceGraph, assignedTasks = [], specialistTier = 'A') {
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

  const stable =
    `You assess resilience component "${componentId}". ` +
    'Tool order: use retrieve_for_claim, cross_source_compare, or expand_source_neighborhood FIRST; ' +
    'then lookup_signals to verify catalog refs; use get_source for verbatim quotes. ' +
    'Submit via submit_component_assessment. Every claim MUST have evidence_refs. ' +
    'If thin_evidence, use severity abstain. For retrieval gaps, add attempted: entries when you tried to close them.\n' +
    compactHint +
    tierBHint +
    adversarialSystemHint(compEp);

  const dynamic =
    `\nEPISTEMIC HINTS:\n${epBlock}\n\n` +
    `EVIDENCE GRAPH:\n${graphBlock}` +
    taskBlock;

  return { stable, dynamic };
}

function abstentionAssessment(componentId, epistemicProfile, traceId, specialistTier = 'C') {
  const ep = epistemicProfile?.by_component?.[componentId] ?? {};
  return {
    component_id: componentId,
    severity: 'abstain',
    confidence: 'low',
    operator_status: 'insufficient_data',
    claims: [],
    narrative: ep.thin_evidence
      ? `Insufficient evidence to assess ${componentId.replaceAll('_', ' ')} today.`
      : `Assessment abstained for ${componentId.replaceAll('_', ' ')}.`,
    dissent_summary: '',
    retrieval_gaps: [`need more evidence for ${componentId}`],
    reasoning_trace_id: traceId,
    evidence_tree: [],
    specialist_tier: specialistTier,
  };
}

/**
 * @param {object} params
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

  if (abstain || tier === 'C') {
    return abstentionAssessment(componentId, epistemicProfile, traceId, tier);
  }

  const ep = epistemicProfile?.by_component?.[componentId] ?? {};
  if (!abstain && shouldAbstainFromInvestigation(ep) && tier !== 'A') {
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

  const maxRounds = maxRoundsForTier(tier);

  const result = await kernel.run({
    profile: ASSESSMENT_SPECIALIST_PROFILE,
    agentKind: `specialist:${componentId}`,
    model,
    maxRounds,
    maxTokens: 3000,
    system: buildSpecialistSystem(componentId, epistemicProfile, evidenceGraph, allTasks, tier),
    messages: [{
      role: 'user',
      content: userContent,
    }],
    tools: SPECIALIST_TOOLS,
    budget,
    traceId: `${traceId}:${componentId}`,
    onUsage,
    executeTool: async (name, input) => {
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
    },
  });

  const submitted = result.submitPayloads.find((p) => p.tool === 'submit_component_assessment');
  assessment = submitted?.payload ?? assessment;

  if (!assessment) {
    assessment = buildFallbackAssessment(componentId, evidenceGraph, epistemicProfile, traceId);
  }

  assessment.evidence_tree = assessment.claims ?? [];
  assessment.tool_usage = toolUsage;
  assessment.gap_closure_tasks = gapClosureTasks;
  assessment.specialist_tier = tier;
  return assessment;
}

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
  const narrative = claims.map((c) => c.text).join(' ') || `No substantive signals for ${componentId} today.`;
  return {
    component_id: componentId,
    severity: ep.thin_evidence ? 'abstain' : 'moderate',
    confidence: ep.certainty_band === 'high' ? 'medium' : 'low',
    operator_status: ep.thin_evidence ? 'insufficient_data' : 'stable',
    claims,
    narrative,
    dissent_summary: ep.contested ? 'Evidence appears contested across sources.' : '',
    retrieval_gaps: graph?.retrieval_gaps ?? [],
    reasoning_trace_id: `${traceId}:${componentId}`,
    evidence_tree: claims,
  };
}

export { buildFallbackAssessment, buildSpecialistSystem };
