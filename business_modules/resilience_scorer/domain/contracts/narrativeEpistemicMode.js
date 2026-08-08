/**
 * Narrative epistemic mode — decouples investigation narrative from strict abstention.
 *
 * Pipeline position: assess/agent path — controls whether specialists may narrate
 * from thin investigation pools while instrument badges stay honest. Client-safe.
 *
 * Owns: narrativeEpistemicMode and narrativeInvestigationPermissive flags.
 * Does NOT: numeric scoring, GROUNDING_TIER verification, or narrativeGrounding QA.
 *
 * Key collaborators: userEpistemicOverlay.js, assessmentOrchestrator.js,
 * userSurfaceMode.js.
 */
import { userEpistemicOverlayEnabled } from './userEpistemicOverlay.js';

/** @typedef {'strict' | 'permissive'} NarrativeEpistemicMode */

/**
 * Resolve narrative epistemic mode from env (strict default).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {NarrativeEpistemicMode}
 */
export function narrativeEpistemicMode(env = process.env) {
  return env.RESILIENCE_NARRATIVE_EPISTEMIC_MODE === 'permissive' ? 'permissive' : 'strict';
}

/**
 * Return true when specialists may summarize investigation-pool signals even when
 * epistemic gates would otherwise abstain (thin/single-channel). Instrument badges
 * remain honest regardless.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function narrativeInvestigationPermissive(env = process.env) {
  return narrativeEpistemicMode(env) === 'permissive'
    || !userEpistemicOverlayEnabled(env);
}
