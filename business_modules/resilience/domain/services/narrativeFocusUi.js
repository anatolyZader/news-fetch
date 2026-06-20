/**
 * Narrative-first operator UI — suppress guidance layers on main site.
 * Analyst site continues to use ?view=analyst for full attention/compass/brief.
 */

export function narrativeFocusUiEnabled(env = process.env) {
  return env.RESILIENCE_NARRATIVE_FOCUS_UI === '1';
}

/**
 * Strip guidance artifacts from an operator report payload (mutates assessment copy).
 * @param {object} payload
 * @returns {object}
 */
export function stripOperatorGuidancePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload, narrative_focus_ui: true };
  out.attention_items = [];
  out.action_compass = null;
  if (out.assessment && typeof out.assessment === 'object') {
    const assessment = { ...out.assessment };
    delete assessment.decision_brief;
    delete assessment.operator_recommendations;
    out.assessment = assessment;
  }
  return out;
}
