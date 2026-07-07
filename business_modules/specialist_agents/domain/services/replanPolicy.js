/**
 * Single re-plan hop after specialist pass when findings warrant it.
 */
import { replanHopEnabled, synthesisGapThreshold } from '../../../../cross-cut-modules/agent/agentConfig.js';

function countOpenGaps(assessments) {
  const gaps = (assessments ?? []).flatMap((a) => a.retrieval_gaps ?? []);
  return gaps.filter((g) => !String(g).startsWith('attempted:')).length;
}

/**
 * @param {object} params
 */
export function needsReplan(params) {
  const {
    componentAssessments = [],
    crossComponentIssues = [],
    plan = null,
    plannerContext = null,
  } = params;

  if (!replanHopEnabled()) return false;

  const groundedCross = crossComponentIssues.filter((i) => i.both_grounded === true);
  if (groundedCross.length > 0) return true;

  const openGaps = countOpenGaps(componentAssessments);
  if (openGaps > synthesisGapThreshold() + 2) return true;

  const focusSet = new Set(plan?.focus_components ?? []);
  for (const a of componentAssessments) {
    if ((a.severity === 'high' || a.severity === 'critical') && !focusSet.has(a.component_id)) {
      return true;
    }
  }

  if ((plannerContext?.media_volume_anomalies ?? []).length > 0) {
    const unexplored = (plannerContext.media_volume_anomalies ?? []).filter(
      (m) => !(plan?.investigation_tasks ?? []).some(
        (t) => t.component_id === m.component_id && t.type === 'archive_explore',
      ),
    );
    if (unexplored.length > 0) return true;
  }

  return false;
}

/**
 * @param {object} params
 */
export function buildReplanContext(params) {
  const {
    plannerContext = {},
    componentAssessments = [],
    crossComponentIssues = [],
  } = params;

  const summaries = componentAssessments.map((a) => ({
    component_id: a.component_id,
    severity: a.severity,
    confidence: a.confidence,
    open_gaps: (a.retrieval_gaps ?? []).filter((g) => !String(g).startsWith('attempted:')).slice(0, 5),
    claim_count: (a.claims ?? []).length,
    narrative_excerpt: String(a.narrative ?? '').slice(0, 160),
  }));

  return {
    ...plannerContext,
    replan: true,
    specialist_summaries: summaries,
    cross_component_issues: crossComponentIssues,
    replan_instruction: 'Adjust focus_components and investigation_tasks based on specialist findings and cross-component contradictions.',
  };
}

/**
 * Components to re-assess after re-plan.
 * @param {object} newPlan
 * @param {object} oldPlan
 * @param {object[]} crossComponentIssues
 */
export function affectedComponentsForReplan(newPlan, oldPlan, crossComponentIssues = []) {
  const affected = new Set(affectedComponentsFromCrossIssues(crossComponentIssues));

  const oldFocus = new Set(oldPlan?.focus_components ?? []);
  for (const id of newPlan?.focus_components ?? []) {
    if (!oldFocus.has(id)) affected.add(id);
  }

  for (const t of newPlan?.gap_closure_tasks ?? []) {
    if (t.component_id) affected.add(t.component_id);
  }

  for (const t of newPlan?.investigation_tasks ?? []) {
    if (t.component_id) affected.add(t.component_id);
  }

  return [...affected];
}

function affectedComponentsFromCrossIssues(issues) {
  const set = new Set();
  for (const issue of issues ?? []) {
    for (const id of issue.components ?? []) set.add(id);
  }
  return set;
}

export { countOpenGaps };
