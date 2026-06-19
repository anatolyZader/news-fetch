/**
 * Synthesizer agent — cross-component narrative and attention items.
 */
import {
  createAgentKernel,
  SONNET_MODEL,
  PROMPT_VERSION,
  slimSynthPromptsEnabled,
} from '../../../cross-cut-modules/agent/index.js';
import {
  compactComponentAssessmentsForSynth,
  compactEpistemicByComponentForSynth,
} from '../../../cross-cut-modules/retrieval/compactAssessPrompts.js';
import {
  SYNTHESIZER_TOOLS,
  ASSESSMENT_SYNTHESIZER_PROFILE,
} from '../../../cross-cut-modules/agent/profiles/assessment.profile.js';
import { buildAttentionItems } from '../../resilience/index.js';
import { needsLlmSynthesis } from '../domain/services/synthesisPolicy.js';
import { componentLabel } from '../domain/services/narrativeTemplates.js';

function buildSynthesizerSystem(componentAssessments, epistemicProfile, oovClusters = [], openObservationClaims = []) {
  const slim = slimSynthPromptsEnabled();
  const assessments = slim
    ? compactComponentAssessmentsForSynth(componentAssessments)
    : componentAssessments;
  const epistemic = slim
    ? compactEpistemicByComponentForSynth(epistemicProfile)
    : (epistemicProfile?.by_component ?? {});

  const stable =
    'Synthesize cross-component resilience assessment. Use submit_synthesis tool. ' +
    'Do not invent facts not present in component assessments. ' +
    'Write cross_component_synthesis as concise, operator-readable English prose; ' +
    'do not paste raw or multi-language evidence quotes into the synthesis. ' +
    'Address any OOV clusters and unverified repeated phrasing in your synthesis. ' +
    'Treat open observations and catalog signals equally; cite unverified material explicitly.';

  let dynamic =
    `\n\nCOMPONENT ASSESSMENTS:\n${JSON.stringify(assessments, null, 2)}\n\n` +
    `EPISTEMIC PROFILE:\n${JSON.stringify(epistemic, null, 2)}`;

  if (oovClusters.length) {
    dynamic += `\n\nOOV CLUSTERS (must mention in synthesis if material):\n${JSON.stringify(oovClusters.slice(0, 5), null, 2)}`;
  }
  if (openObservationClaims.length) {
    dynamic += `\n\nOPEN OBSERVATION CLAIMS (unverified — cite explicitly if material):\n${JSON.stringify(openObservationClaims.slice(0, 12), null, 2)}`;
  }

  return { stable, dynamic };
}

function isAbstained(component) {
  return component.severity === 'abstain' || component.operator_status === 'insufficient_data';
}

function dominantSourceFamily(epistemicProfile, componentAssessments) {
  const byComponent = epistemicProfile?.by_component ?? {};
  const families = new Map();
  let withDominance = 0;
  for (const c of componentAssessments) {
    const warning = (byComponent[c.component_id]?.dominance_warnings ?? [])
      .find((w) => w?.layer === 'source_type');
    if (!warning) continue;
    withDominance += 1;
    if (warning.key) families.set(warning.key, (families.get(warning.key) ?? 0) + 1);
  }
  const majority = componentAssessments.length > 0
    && withDominance >= Math.ceil(componentAssessments.length / 2);
  if (!majority || families.size === 0) return null;
  const [topFamily] = [...families.entries()].sort((a, b) => b[1] - a[1])[0];
  return topFamily;
}

function buildDeterministicSummary(componentAssessments, epistemicProfile, gapCount) {
  const focus = componentAssessments.filter((c) =>
    c.severity === 'high' || c.severity === 'critical');
  const abstained = componentAssessments.filter(isAbstained);
  const assessed = componentAssessments.length - abstained.length;

  const sentences = [];
  if (focus.length) {
    const labels = focus.map((c) => componentLabel(c.component_id).toLowerCase()).join(', ');
    sentences.push(`Today's assessment highlights ${labels} as area(s) requiring attention.`);
  } else {
    sentences.push('Overall resilience indicators remain within typical ranges based on available evidence.');
  }

  if (componentAssessments.length) {
    const total = componentAssessments.length;
    let coverage = `${assessed} of ${total} components had sufficient evidence to assess`;
    coverage += abstained.length
      ? `; ${abstained.length} abstained pending corroboration.`
      : '.';
    sentences.push(coverage);
  }

  // Operator register: signal the single-channel concentration qualitatively;
  // the named source family and shares stay in analyst-only surfaces.
  const widespreadDominance = dominantSourceFamily(epistemicProfile, componentAssessments) !== null;
  if (widespreadDominance) {
    sentences.push('Evidence is concentrated in a single evidence channel across most components; treat component reads as provisional.');
  }

  if (gapCount > 0) {
    sentences.push(`${gapCount} open evidence gap(s) remain.`);
  }

  return sentences.join(' ');
}

export function defaultSynthesis(componentAssessments, epistemicProfile) {
  const retrieval_gaps = [...new Set(componentAssessments.flatMap((c) => c.retrieval_gaps ?? []))];
  const summary = buildDeterministicSummary(componentAssessments, epistemicProfile, retrieval_gaps.length);
  return {
    cross_component_synthesis: summary,
    attention_items: [],
    decision_brief_summary: summary,
    retrieval_gaps,
  };
}

/**
 * @param {object} params
 */
export async function runSynthesizerAgent(params) {
  const {
    componentAssessments,
    epistemicProfile,
    llmPort,
    agentKernel,
    onUsage,
    budget,
    traceId,
    partialAssessment = null,
    oovClusters = [],
    openObservationClaims = [],
  } = params;

  if (!needsLlmSynthesis({
    componentAssessments,
    epistemicProfile,
    budget,
    degradeReason: params.degradeReason ?? null,
    assessmentMode: params.assessmentMode ?? 'normal',
  })) {
    const synthesis = defaultSynthesis(componentAssessments, epistemicProfile);
    const draftAssessment = {
      ...partialAssessment,
      components: componentAssessments,
      cross_component_synthesis: synthesis.cross_component_synthesis,
      retrieval_gaps: synthesis.retrieval_gaps ?? [],
    };
    const attention_items = buildAttentionItems(draftAssessment, { view: 'operator' });
    return {
      cross_component_synthesis: synthesis.cross_component_synthesis,
      attention_items,
      decision_brief: synthesis.decision_brief_summary
        ? { summary: synthesis.decision_brief_summary, priority_items: [], source: 'agent_v2' }
        : null,
      retrieval_gaps: synthesis.retrieval_gaps ?? [],
      traceId: null,
      prompt_version: PROMPT_VERSION,
      synthesis_mode: 'deterministic',
    };
  }

  const kernel = agentKernel ?? createAgentKernel({ llmPort });
  let synthesis = null;

  const result = await kernel.run({
    profile: ASSESSMENT_SYNTHESIZER_PROFILE,
    agentKind: 'synthesizer',
    model: SONNET_MODEL,
    maxRounds: 2,
    maxTokens: 4000,
    system: buildSynthesizerSystem(componentAssessments, epistemicProfile, oovClusters, openObservationClaims),
    messages: [{
      role: 'user',
      content: 'Produce cross-component synthesis and priority attention themes.',
    }],
    tools: SYNTHESIZER_TOOLS,
    budget,
    traceId: `${traceId}:synth`,
    onUsage,
    executeTool: async (name, input) => {
      if (name === 'submit_synthesis') {
        synthesis = input;
        return JSON.stringify({ ok: true });
      }
      return JSON.stringify({ error: 'unknown_tool' });
    },
  });

  const submitted = result.submitPayloads.find((p) => p.tool === 'submit_synthesis');
  synthesis = submitted?.payload ?? synthesis ?? defaultSynthesis(componentAssessments, epistemicProfile);

  const draftAssessment = {
    ...partialAssessment,
    components: componentAssessments,
    cross_component_synthesis: synthesis.cross_component_synthesis,
    retrieval_gaps: synthesis.retrieval_gaps ?? [],
  };
  const attention_items = synthesis.attention_items?.length
    ? synthesis.attention_items
    : buildAttentionItems(draftAssessment, { view: 'operator' });

  return {
    cross_component_synthesis: synthesis.cross_component_synthesis,
    attention_items,
    decision_brief: synthesis.decision_brief_summary
      ? { summary: synthesis.decision_brief_summary, priority_items: [], source: 'agent_v2' }
      : null,
    retrieval_gaps: synthesis.retrieval_gaps ?? [],
    traceId: result.traceId,
    prompt_version: PROMPT_VERSION,
    synthesis_mode: 'llm',
  };
}

export { buildSynthesizerSystem };
