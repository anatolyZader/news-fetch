/**
 * assessment.v2 schema constants and validators.
 */

export const ASSESSMENT_SCHEMA_VERSION = '2.0';

export const SEVERITY_VALUES = Object.freeze(['low', 'moderate', 'high', 'critical', 'abstain']);
export const CONFIDENCE_VALUES = Object.freeze(['low', 'medium', 'high']);
export const OPERATOR_STATUS_VALUES = Object.freeze([
  'stable', 'watch', 'critical_failure', 'insufficient_data',
]);

function validateComponentClaims(component, componentIndex, errors) {
  for (const [j, claim] of (component.claims ?? []).entries()) {
    if (!claim.text) errors.push(`components[${componentIndex}].claims[${j}].text required`);
    if (!Array.isArray(claim.evidence_refs) || claim.evidence_refs.length === 0) {
      errors.push(`components[${componentIndex}].claims[${j}].evidence_refs required`);
    }
  }
}

function validateComponent(component, index, errors) {
  if (!component.component_id) errors.push(`components[${index}].component_id required`);
  if (component.severity && !SEVERITY_VALUES.includes(component.severity)) {
    errors.push(`components[${index}].severity invalid`);
  }
  validateComponentClaims(component, index, errors);
}

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
  if (Array.isArray(assessment.components)) {
    for (const [i, c] of assessment.components.entries()) {
      validateComponent(c, i, errors);
    }
  } else {
    errors.push('components array required');
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
