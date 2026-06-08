/**
 * Deterministic assessment degrade path — no LLM; evidence graph + epistemic instruments only.
 */
import { PROMPT_VERSION, MODEL_CARD_REF } from '../../../cross-cut-modules/agent/index.js';
import { buildEvidenceGraph } from '../../../cross-cut-modules/retrieval/evidenceGraph.js';
import { buildPlannerContext } from '../../../cross-cut-modules/retrieval/plannerContextBuilder.js';
import { COMPONENT_IDS } from '../../../cross-cut-modules/resilience-contracts/componentIds.js';
import {
  ASSESSMENT_SCHEMA_VERSION,
  createEmptyAssessmentV2,
  validateAssessmentV2,
} from '../../../cross-cut-modules/resilience-contracts/assessmentV2.js';
import { buildAttentionItems } from '../../resilience/index.js';
import { buildFallbackAssessment } from './componentSpecialistAgent.js';
import { defaultPlan } from './plannerAgent.js';
import { defaultSynthesis } from './synthesizerAgent.js';
import { mapAssessmentV2ToLegacy } from '../domain/services/assessmentV2Mapper.js';

/**
 * @typedef {'agent_failed'|'budget_exceeded'|'forced_deterministic'|'legacy_flag_deprecated'} DegradeReason
 */

/**
 * @param {object} params
 * @param {DegradeReason} params.degradeReason
 * @returns {Promise<{ assessment: object, assessmentV2: object, traceId: null, isEmpty: boolean }>}
 */
export async function runDeterministicAssessment(params) {
  const {
    signals,
    epistemicProfile,
    reportDate,
    reportScopeId = 'national',
    totalArticles = 0,
    assessmentMode = 'degraded',
    dataVoid = null,
    epistemicStatus = null,
    oovBurst = null,
    scoredComponents = null,
    degradeReason = 'agent_failed',
  } = params;

  const traceId = null;
  const scoredFull = scoredComponents ?? {};

  if (!scoredFull || Object.keys(scoredFull).length === 0) {
    return {
      assessment: null,
      assessmentV2: null,
      traceId,
      isEmpty: true,
    };
  }

  const evidenceGraph = buildEvidenceGraph({
    hits: [],
    signals,
    epistemicProfile,
    oovBurst,
    totalArticles,
    residualObservations: [],
  });

  const plannerContext = buildPlannerContext({
    epistemicProfile,
    evidenceGraph,
    oovBurst,
    assessmentMode,
    archiveMentionMass: {},
    residualObservations: [],
  });

  const currentPlan = {
    ...defaultPlan(epistemicProfile, plannerContext),
    planner_source: 'deterministic',
  };

  const componentAssessments = COMPONENT_IDS.map((componentId) =>
    buildFallbackAssessment(componentId, evidenceGraph, epistemicProfile, traceId ?? `det-${componentId}`),
  );

  const synth = defaultSynthesis(componentAssessments, epistemicProfile);
  const draftAssessment = {
    components: componentAssessments,
    cross_component_synthesis: synth.cross_component_synthesis,
    retrieval_gaps: synth.retrieval_gaps ?? [],
  };
  const attention_items = buildAttentionItems(draftAssessment, { view: 'operator' });

  const v2Partial = createEmptyAssessmentV2({
    date: reportDate,
    report_scope_id: reportScopeId,
    assessment_mode: assessmentMode,
    agent_trace_id: null,
    epistemic_profile_ref: epistemicProfile?.report_date
      ? `epistemic-profile-${reportScopeId}-${reportDate}.json`
      : null,
    total_articles_analyzed: totalArticles,
    prompt_version: PROMPT_VERSION,
    model_card_ref: MODEL_CARD_REF,
  });
  v2Partial.components = componentAssessments;

  const assessmentV2 = {
    ...v2Partial,
    schema_version: ASSESSMENT_SCHEMA_VERSION,
    cross_component_synthesis: synth.cross_component_synthesis,
    attention_items,
    decision_brief: synth.decision_brief_summary
      ? { summary: synth.decision_brief_summary, priority_items: [], source: 'deterministic' }
      : null,
    retrieval_gaps: synth.retrieval_gaps ?? [],
    synthesis_mode: 'deterministic',
    agent_trace_id: null,
    budget_snapshot: null,
    investigation_plan: currentPlan,
    planner_context: plannerContext,
    cross_component_issues: [],
    evidence_graph_summary: {
      component_count: Object.keys(evidenceGraph.by_component ?? {}).length,
      hit_count: 0,
      component_rag_hits: 0,
      oov_cluster_count: evidenceGraph.oov_cluster_count ?? 0,
      residual_observation_count: 0,
      planner_source: currentPlan.planner_source ?? 'deterministic',
      synthesis_mode: 'deterministic',
    },
    assessment_degraded: {
      mode: 'deterministic',
      reason: degradeReason,
    },
    degrade_reason: degradeReason,
  };

  const validation = validateAssessmentV2(assessmentV2);
  if (!validation.valid) assessmentV2.validation_warnings = validation.errors;

  const legacy = mapAssessmentV2ToLegacy(assessmentV2, epistemicProfile, {
    dataVoid,
    epistemicStatus,
  });

  legacy.assessment_degraded = assessmentV2.assessment_degraded;
  legacy.degrade_reason = degradeReason;
  legacy.assessment_mode = assessmentMode;
  legacy.synthesis_mode = 'deterministic';
  legacy.agent_trace_id = null;

  return {
    assessment: legacy,
    assessmentV2,
    traceId,
    isEmpty: false,
  };
}
