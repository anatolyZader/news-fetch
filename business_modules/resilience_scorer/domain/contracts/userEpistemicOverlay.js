/**
 * User epistemic overlay feature flag.
 *
 * Pipeline position: report and chat paths — gates decision-brief and guidance
 * overlay generation/exposure. Client-safe isomorphic (env-driven).
 *
 * Owns: userEpistemicOverlayEnabled env gate.
 * Does NOT: unconditional report badge suppression (handled in reportRoutes) or
 * narrativeGrounding QA.
 *
 * Key collaborators: narrativeEpistemicMode.js, reportRoutes.js, chat guidance tools.
 */

/**
 * Return true when epistemic overlay layers (decision brief, recommendations,
 * chat guidance tools) should be generated and exposed to users.
 * Default ON; RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY=0 disables.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function userEpistemicOverlayEnabled(env = process.env) {
  if (env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY === '0') return false;
  // Deprecated one-release shim — migrate deploy config to OPERATOR_EPISTEMIC_OVERLAY=0
  if (env.RESILIENCE_NARRATIVE_FOCUS_UI === '1') return false;
  return true;
}
