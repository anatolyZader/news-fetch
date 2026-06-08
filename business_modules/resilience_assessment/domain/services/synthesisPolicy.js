/**
 * When to invoke LLM synthesizer vs deterministic defaultSynthesis.
 */
import {
  conditionalSynthEnabled,
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
 * @param {{ componentAssessments?: object[], epistemicProfile?: object, gapThreshold?: number }} params
 * @returns {boolean}
 */
export function needsLlmSynthesis(params) {
  const {
    componentAssessments = [],
    epistemicProfile = {},
    gapThreshold = synthesisGapThreshold(),
  } = params;

  if (!conditionalSynthEnabled()) return true;

  for (const c of componentAssessments) {
    if (c.severity === 'high' || c.severity === 'critical') return true;
  }

  if (contestedNonAbstainCount(componentAssessments, epistemicProfile) >= 2) {
    return true;
  }

  if (countOpenGaps(componentAssessments) > gapThreshold) return true;

  return false;
}

export { countOpenGaps, contestedNonAbstainCount };
