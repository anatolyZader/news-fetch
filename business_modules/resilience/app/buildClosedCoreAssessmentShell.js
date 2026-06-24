/**
 * Score-only assessment shell for closed-core narrate (hybrid pipeline fills prose).
 */
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { buildAssessmentPayload } from '../infrastructure/claudeNarratives.js';

/**
 * @param {object} params
 * @returns {object}
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
 * @param {object} shell
 * @param {object} plan
 * @returns {object}
 */
export function applyNarrativeOverflowDegrade(shell, plan) {
  shell.assessment_degraded = {
    mode: 'narrative_context_overflow',
    reason: 'Narrative LLM context exceeded budget after full degrade ladder',
    prompt_budget: {
      degrade_level: plan.degradeLevel,
      section_estimates: plan.section_estimates,
      registry_count: plan.registry?.refCount ?? 0,
      digest_cap: plan.digest_cap,
    },
  };
  shell.narrative_prompt_budget = shell.assessment_degraded.prompt_budget;
  return shell;
}
