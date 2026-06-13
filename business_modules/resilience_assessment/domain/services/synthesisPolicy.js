/**
 * When to invoke LLM synthesizer vs deterministic defaultSynthesis.
 * Default: LLM unless explicitly degraded.
 */
import {
  conditionalSynthEnabled,
  forceDeterministicSynthEnabled,
  synthesisGapThreshold,
} from '../../../../cross-cut-modules/agent/agentConfig.js';

function countOpenGaps(componentAssessments) {
  const gaps = componentAssessments.flatMap((c) => c.retrieval_gaps ?? []);
  return gaps.filter((g) => !String(g).startsWith('attempted:')).length;
}

function contestedNonAbstainCount(componentAssessments, epistemicProfile) {
  let n = 0;
  for (const c of componentAssessments) {
    if (c.severity === 'abstain') continue;
    const ep = epistemicProfile?.by_component?.[c.component_id] ?? {};
    if (ep.contested) n += 1;
  }
  return n;
}

/**
 * Legacy calm-day skip heuristics when RESILIENCE_ASSESS_CONDITIONAL_SYNTH=1.
 * @param {{ componentAssessments?: object[], epistemicProfile?: object, gapThreshold?: number }} params
 * @returns {boolean}
 */
function legacyConditionalSkip(params) {
  const {
    componentAssessments = [],
    epistemicProfile = {},
    gapThreshold = synthesisGapThreshold(),
  } = params;

  for (const c of componentAssessments) {
    if (c.severity === 'high' || c.severity === 'critical') return false;
  }

  if (contestedNonAbstainCount(componentAssessments, epistemicProfile) >= 2) {
    return false;
  }

  if (countOpenGaps(componentAssessments) > gapThreshold) return false;

  return true;
}

/**
 * @param {object} params
 * @returns {boolean}
 */
export function needsLlmSynthesis(params = {}) {
  const {
    componentAssessments = [],
    epistemicProfile = {},
    budget = null,
    degradeReason = null,
    assessmentMode = 'normal',
    gapThreshold = synthesisGapThreshold(),
  } = params;

  if (forceDeterministicSynthEnabled()) return false;
  if (degradeReason) return false;
  if (assessmentMode === 'degraded') return false;
  if (budget?.degradeMode) return false;
  if (!componentAssessments.length) return false;

  if (conditionalSynthEnabled() && legacyConditionalSkip({
    componentAssessments,
    epistemicProfile,
    gapThreshold,
  })) {
    return false;
  }

  return true;
}

export { countOpenGaps, contestedNonAbstainCount, legacyConditionalSkip };
