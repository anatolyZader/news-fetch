/**
 * Operator epistemic overlay flag.
 *
 * Report responses never ship guidance badges (attention items, compass,
 * recommendations) to operators — that is unconditional in reportRoutes. This
 * flag governs what still varies: chat guidance-tool exposure and pipeline-time
 * generation of the decision brief and operator recommendations.
 * Default ON; RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY=0 disables them.
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
