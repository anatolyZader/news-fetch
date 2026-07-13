/**
 * Operator epistemic overlay — compass, attention, brief, recommendations, banners.
 * Default ON; RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY=0 hides guidance layers on operator view.
 * Analyst view (?view=analyst) always receives full overlay regardless of this flag.
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean} true when overlay layers should be shown to operators
 */
export function operatorEpistemicOverlayEnabled(env = process.env) {
  if (env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY === '0') return false;
  // Deprecated one-release shim — migrate deploy config to OPERATOR_EPISTEMIC_OVERLAY=0
  if (env.RESILIENCE_NARRATIVE_FOCUS_UI === '1') return false;
  return true;
}

/**
 * Strip guidance artifacts from an operator report payload.
 * @param {object} payload
 * @returns {object}
 */
export function stripOperatorGuidancePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload, operator_epistemic_overlay: false };
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
