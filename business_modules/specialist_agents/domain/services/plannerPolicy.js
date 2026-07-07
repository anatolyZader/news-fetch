/**
 * When to invoke LLM planner vs deterministic defaultPlan.
 */
import { deterministicPlannerEnabled } from '../../../../cross-cut-modules/agent/agentConfig.js';

/**
 * @param {{ assessmentMode?: string, plannerContext?: object|null }} params
 * @returns {boolean}
 */
export function needsLlmPlanner({ assessmentMode = 'normal', plannerContext = null }) {
  if (plannerContext?.replan === true) return true;
  if (assessmentMode !== 'normal') return true;
  if (plannerContext?.oov_summary) return true;
  if (plannerContext?.residual_summary?.count > 0) return true;
  if ((plannerContext?.archive_anomalies ?? []).length > 0) return true;
  if ((plannerContext?.media_volume_anomalies ?? []).length > 0) return true;
  if ((plannerContext?.exploration_candidates ?? []).length > 0) return true;
  return false;
}

/**
 * @param {{ assessmentMode?: string, plannerContext?: object|null }} params
 * @returns {boolean}
 */
export function shouldUseDeterministicPlanner(params) {
  return deterministicPlannerEnabled() && !needsLlmPlanner(params);
}
