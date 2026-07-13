/**
 * Narrative epistemic mode — decouples investigation/narrative path from scoring epistemics.
 * Scoring and instrument badges stay strict; permissive mode allows rich specialist narratives.
 */

import { operatorEpistemicOverlayEnabled } from './operatorEpistemicOverlay.js';

/** @typedef {'strict' | 'permissive'} NarrativeEpistemicMode */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {NarrativeEpistemicMode}
 */
export function narrativeEpistemicMode(env = process.env) {
  return env.RESILIENCE_NARRATIVE_EPISTEMIC_MODE === 'permissive' ? 'permissive' : 'strict';
}

/**
 * When true, specialists/planner may summarize investigation-pool signals even when
 * scoring epistemics would abstain (thin/single-channel). Instrument badges stay honest.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function narrativeInvestigationPermissive(env = process.env) {
  return narrativeEpistemicMode(env) === 'permissive'
    || !operatorEpistemicOverlayEnabled(env);
}
