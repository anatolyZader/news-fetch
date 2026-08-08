/**
 * Closed-core assessment shell: evidence-only payload before hybrid narrative fill.
 *
 * **Owns:** construction of an assessment JSON skeleton with empty component narratives
 * and count-based evidence slots (`scoredFull`); overflow degrade metadata attachment.
 *
 * **Pipeline position:** first step of `closedCoreNarrate` when `RESILIENCE_CLOSED_CORE_ASSESS`
 * or rich deterministic path is active (skips specialist agent).
 *
 * **Inputs:** `scoredFull` evidence map, report date, article count, scope, macro/dataVoid context.
 *
 * **Outputs:** assessment object with `assessment_mode: 'closed_core'`; optional degrade block.
 *
 * **Does NOT:** call LLMs, run specialist agents, or add numeric scores.
 *
 * **Collaborators:** `infrastructure/claudeNarratives.buildAssessmentPayload`,
 * `closedCoreNarrate`, `userNarrativePipeline`.
 */
import { RESILIENCE_COMPONENTS } from '../../domain/resilienceComponents.js';
import { buildAssessmentPayload } from '../../infrastructure/claudeNarratives.js';

/**
 * Build assessment shell with empty narratives; evidence counts filled from scoredFull.
 *
 * @param {object} params
 * @param {Record<string, object>} params.scoredFull — per-component evidence from evidence pipeline
 * @param {string} params.reportDate
 * @param {number} params.scopedTotalArticles
 * @returns {object} assessment with `assessment_mode: 'closed_core'`
 */
export function buildClosedCoreAssessmentShell(params) {
  const {
    scoredFull,
    reportDate,
    scopedTotalArticles,
    reportScope = null,
    macroSignals = [],
    dataVoid = null,
    oovCaptureCount = 0,
    socialChannelQuarantine = null,
    allScopedSignals = null,
    contentKind = 'news',
  } = params;

  const emptyNarratives = {
    components: RESILIENCE_COMPONENTS.map((def) => ({ component_id: def.id })),
    cross_component_synthesis: '',
    evidence_quality_note: '',
  };

  const meta = {
    date: reportDate,
    reportScope,
    totalArticles: scopedTotalArticles,
    contentKind,
    macroSignals,
    dataVoid,
    oovCaptureCount,
    socialChannelQuarantine,
    allScopedSignals,
  };

  const assessment = buildAssessmentPayload(emptyNarratives, scoredFull, meta);
  assessment.assessment_mode = 'closed_core';
  assessment.assessment_degraded = null;
  return assessment;
}

/**
 * Mark shell degraded when narrative preflight exceeds context budget (no LLM call).
 *
 * @param {object} shell — mutates in place
 * @param {object} plan — from `resolveNarrativeContextPlan`
 * @returns {object} same shell reference with `assessment_degraded` set
 */
export function applyNarrativeOverflowDegrade(shell, plan) {
  shell.assessment_degraded = {
    mode: 'narrative_context_overflow',
    reason: 'Narrative LLM context exceeded budget after full degrade ladder',
    prompt_budget: {
      degrade_level: plan.degradeLevel,
      section_estimates: plan.section_estimates,
      registry_count: plan.registry?.refCount ?? 0,
      digest_cap: plan.digestCap,
    },
  };
  shell.narrative_prompt_budget = shell.assessment_degraded.prompt_budget;
  return shell;
}
