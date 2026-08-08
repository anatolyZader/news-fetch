/**
 * User surface mode — rich investigation pool vs legacy report path.
 *
 * Pipeline position: assess/narrate path — selects Track B hybrid narrative
 * pipeline and evidence-pool sizing. Client-safe isomorphic (env-driven).
 *
 * Owns: userSurfaceMode and related env-tuned limits.
 * Does NOT: specialist agent orchestration internals or numeric scores (min-math).
 *
 * Key collaborators: assessmentOrchestrator.js, userNarrativePipeline.js,
 * closedCoreNarrate.js, evidence pool builders.
 */

/** @typedef {'legacy' | 'rich'} UserSurfaceMode */

/**
 * Resolve user surface mode from RESILIENCE_OPERATOR_SURFACE_MODE.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {UserSurfaceMode}
 */
export function userSurfaceMode(env = process.env) {
  return env.RESILIENCE_OPERATOR_SURFACE_MODE === 'rich' ? 'rich' : 'legacy';
}

/**
 * When true, assessment skips assessment-agent specialists (rich Track B path).
 * Narrative uses the hybrid facts/judge/polish pipeline when closed-core assess is enabled.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function richSurfaceSkipSpecialists(env = process.env) {
  return userSurfaceMode(env) === 'rich';
}

/**
 * Alias for rich-surface specialist skip — used by deterministic narrative routing.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function shouldUseRichDeterministicPath(env = process.env) {
  return richSurfaceSkipSpecialists(env);
}

/**
 * @deprecated use richSurfaceSkipSpecialists
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function richSurfaceDeterministicOnly(env = process.env) {
  return richSurfaceSkipSpecialists(env);
}

/**
 * Max evidence characters per highlight in rich user surface mode.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function userEvidenceChars(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_OPERATOR_EVIDENCE_CHARS ?? '1200', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 4000) : 1200;
}

/**
 * Max claims in deterministic narrative fallback when hybrid polish is unavailable.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function userMaxClaims(env = process.env) {
  const raw = env.RESILIENCE_OPERATOR_MAX_CLAIMS;
  if (raw === undefined || raw === '') return 12;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 12;
  return n;
}

/**
 * Highlighted evidence rows per source bucket in rich user surface mode.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function userHighlightPerSource(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_OPERATOR_HIGHLIGHT_PER_SOURCE ?? '12', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 12;
}
