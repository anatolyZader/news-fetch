/**
 * assessment.v2 schema constants and validators.
 */

export const ASSESSMENT_SCHEMA_VERSION = '2.0';

export const SEVERITY_VALUES = Object.freeze(['low', 'moderate', 'high', 'critical', 'abstain']);
export const CONFIDENCE_VALUES = Object.freeze(['low', 'medium', 'high']);
export const OPERATOR_STATUS_VALUES = Object.freeze([
  'stable', 'watch', 'critical_failure', 'insufficient_data',
]);

/**
 * @param {object} assessment
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAssessmentV2(assessment) {
  const errors = [];
  if (!assessment || typeof assessment !== 'object') {
    return { valid: false, errors: ['assessment must be an object'] };
  }
  if (assessment.schema_version !== ASSESSMENT_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${ASSESSMENT_SCHEMA_VERSION}`);
  }
  if (!assessment.date) errors.push('date required');
  if (!Array.isArray(assessment.components)) errors.push('components array required');
  else {
    for (const [i, c] of assessment.components.entries()) {
      if (!c.component_id) errors.push(`components[${i}].component_id required`);
      if (c.severity && !SEVERITY_VALUES.includes(c.severity)) {
        errors.push(`components[${i}].severity invalid`);
      }
      for (const [j, claim] of (c.claims ?? []).entries()) {
        if (!claim.text) errors.push(`components[${i}].claims[${j}].text required`);
        if (!Array.isArray(claim.evidence_refs) || claim.evidence_refs.length === 0) {
          errors.push(`components[${i}].claims[${j}].evidence_refs required`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * @param {object} params
 */
export function createEmptyAssessmentV2(params) {
  return {
    schema_version: ASSESSMENT_SCHEMA_VERSION,
    prompt_version: params.prompt_version ?? 'assessment-v1.0',
    model_card_ref: params.model_card_ref ?? 'MODEL-CARD.md#assessment-agent',
    date: params.date,
    report_scope_id: params.report_scope_id ?? 'national',
    assessment_mode: params.assessment_mode ?? 'normal',
    agent_trace_id: params.agent_trace_id ?? null,
    epistemic_profile_ref: params.epistemic_profile_ref ?? null,
    components: [],
    attention_items: [],
    cross_component_synthesis: '',
    retrieval_gaps: [],
    total_articles_analyzed: params.total_articles_analyzed ?? 0,
  };
}
