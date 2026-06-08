/**
 * Cross-component consistency — grounded contradictions between component assessments.
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';

const NEGATIVE_SEVERITY = new Set(['high', 'critical']);
const POSITIVE_OPERATOR = new Set(['stable', 'improving']);
const NEGATIVE_OPERATOR = new Set(['critical_failure', 'degrading', 'at_risk']);

/**
 * @param {object[]} componentAssessments
 */
export function detectCrossComponentContradictions(componentAssessments) {
  const byId = Object.fromEntries(
    (componentAssessments ?? []).map((a) => [a.component_id, a]),
  );
  const issues = [];

  const pairs = [
    ['leadership', 'narrative'],
    ['functional_continuity', 'lifesaving_behavior'],
    ['community_capital', 'belonging_solidarity'],
    ['information_communication', 'narrative'],
  ];

  for (const [aId, bId] of pairs) {
    const a = byId[aId];
    const b = byId[bId];
    if (!a || !b) continue;
    if (a.severity === 'abstain' || b.severity === 'abstain') continue;

    const aRefs = collectRefs(a);
    const bRefs = collectRefs(b);
    if (aRefs.length === 0 || bRefs.length === 0) continue;

    const aNegative = isNegativeAssessment(a);
    const bNegative = isNegativeAssessment(b);
    const aPositive = isPositiveAssessment(a);
    const bPositive = isPositiveAssessment(b);

    if ((aNegative && bPositive) || (bNegative && aPositive)) {
      issues.push({
        type: 'cross_component_contradiction',
        components: [aId, bId],
        component_a: { id: aId, severity: a.severity, operator_status: a.operator_status, refs: aRefs.slice(0, 3) },
        component_b: { id: bId, severity: b.severity, operator_status: b.operator_status, refs: bRefs.slice(0, 3) },
        both_grounded: true,
      });
    }
  }

  return issues;
}

function collectRefs(assessment) {
  const refs = new Set();
  for (const c of assessment.claims ?? []) {
    for (const r of c.evidence_refs ?? []) refs.add(String(r));
  }
  return [...refs];
}

function isNegativeAssessment(a) {
  return NEGATIVE_SEVERITY.has(a.severity)
    || NEGATIVE_OPERATOR.has(a.operator_status);
}

function isPositiveAssessment(a) {
  return (a.severity === 'low' || a.severity === 'moderate')
    && (POSITIVE_OPERATOR.has(a.operator_status) || a.operator_status == null);
}

/**
 * @param {object[]} issues
 */
export function affectedComponentsFromCrossIssues(issues) {
  const set = new Set();
  for (const issue of issues ?? []) {
    for (const id of issue.components ?? []) set.add(id);
  }
  return [...set].filter((id) => COMPONENT_IDS.includes(id));
}

export { collectRefs };
