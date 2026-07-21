/**
 * assessment.v2 schema version constant, validators, and empty shell factory.
 *
 * Pipeline position: assess/agent path — validates specialist agent output shape
 * before persistence. Client-safe isomorphic.
 *
 * Owns: ASSESSMENT_SCHEMA_VERSION, validateAssessmentV2, createEmptyAssessmentV2.
 * Does NOT: agent orchestration, epistemic profile computation, or numeric scores.
 *
 * Key collaborators: assessmentOrchestrator.js, report persistence, openapi schema.
 */

/** Current assessment artifact schema version string. */
export const ASSESSMENT_SCHEMA_VERSION = '2.0';

/** Allowed component severity labels in assessment.v2. */
export const SEVERITY_VALUES = Object.freeze(['low', 'moderate', 'high', 'critical', 'abstain']);

/** Allowed claim confidence labels in assessment.v2. */
export const CONFIDENCE_VALUES = Object.freeze(['low', 'medium', 'high']);

/** Allowed operator_status values on component rows. */
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
 * Validate an assessment.v2 object against the schema contract.
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
 * Create an empty assessment.v2 shell with required metadata fields.
 * @param {object} params
 * @param {string} params.date
 * @param {string} [params.prompt_version]
 * @param {string} [params.model_card_ref]
 * @param {string} [params.report_scope_id]
 * @param {string} [params.assessment_mode]
 * @param {string|null} [params.agent_trace_id]
 * @param {string|null} [params.epistemic_profile_ref]
 * @param {number} [params.total_articles_analyzed]
 * @returns {object}
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
