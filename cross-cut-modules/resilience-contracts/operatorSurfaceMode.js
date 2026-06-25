/**
 * Operator surface mode — Track B (rich pool + deterministic narrative) vs legacy.
 * Product rule: scoring may abstain; operator surface must not starve.
 */

/** @typedef {'legacy' | 'rich'} OperatorSurfaceMode */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {OperatorSurfaceMode}
 */
export function operatorSurfaceMode(env = process.env) {
  return env.RESILIENCE_OPERATOR_SURFACE_MODE === 'rich' ? 'rich' : 'legacy';
}

/**
 * When true, assessment skips specialists and narrative LLM; uses deterministic pool surface.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function richSurfaceDeterministicOnly(env = process.env) {
  return operatorSurfaceMode(env) === 'rich';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function shouldUseRichDeterministicPath(env = process.env) {
  return richSurfaceDeterministicOnly(env);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function operatorEvidenceChars(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_OPERATOR_EVIDENCE_CHARS ?? '1200', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 4000) : 1200;
}

/**
 * Max claims in deterministic narrative; 0 = unlimited.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function operatorMaxClaims(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_OPERATOR_MAX_CLAIMS ?? '0', 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Highlighted evidence per source in rich mode.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function operatorHighlightPerSource(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_OPERATOR_HIGHLIGHT_PER_SOURCE ?? '12', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 12;
}
