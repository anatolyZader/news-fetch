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

function buildSynthesizerSystem(componentAssessments, epistemicProfile, oovClusters = []) {
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
    'Address any OOV clusters and unverified repeated phrasing in your synthesis.';

  let dynamic =
    `\n\nCOMPONENT ASSESSMENTS:\n${JSON.stringify(assessments, null, 2)}\n\n` +
    `EPISTEMIC PROFILE:\n${JSON.stringify(epistemic, null, 2)}`;

  if (oovClusters.length) {
    dynamic += `\n\nOOV CLUSTERS (must mention in synthesis if material):\n${JSON.stringify(oovClusters.slice(0, 5), null, 2)}`;
  }

  return { stable, dynamic };
}

function defaultSynthesis(componentAssessments, _epistemicProfile) {
  const focus = componentAssessments.filter((c) =>
    c.severity === 'high' || c.severity === 'critical');
  const summary = focus.length
    ? `Today's assessment highlights ${focus.map((c) => c.component_id).join(', ')} as areas requiring attention.`
    : 'Overall resilience indicators remain within typical ranges based on available evidence.';
  const retrieval_gaps = componentAssessments.flatMap((c) => c.retrieval_gaps ?? []);
  return {
    cross_component_synthesis: summary,
    attention_items: [],
    decision_brief_summary: summary,
    retrieval_gaps: [...new Set(retrieval_gaps)],
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
  } = params;

  if (!needsLlmSynthesis({ componentAssessments, epistemicProfile })) {
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
    system: buildSynthesizerSystem(componentAssessments, epistemicProfile, oovClusters),
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

export { defaultSynthesis, buildSynthesizerSystem };
