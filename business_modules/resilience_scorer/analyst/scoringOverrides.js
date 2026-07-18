/**
 * Optional weight/tuning overlays for scoreComponents (shadow sensitivity, offline tuning).
 */

import { SIGNAL_TO_COMPONENTS } from '../domain/services/signals/signalRouter.js';
import { COMPONENT_TUNING, createSeededRng } from './scoringShared.js';

/**
 * Deep-merge signal→component weights; overlay values replace base when present.
 * @param {object} baseMapping
 * @param {object|null|undefined} overlay
 */
export function resolveSignalWeights(baseMapping, overlay) {
  if (!overlay || typeof overlay !== 'object') return baseMapping;
  const out = {};
  for (const [type, comps] of Object.entries(baseMapping)) {
    out[type] = { ...comps };
    const o = overlay[type];
    if (o && typeof o === 'object') {
      out[type] = { ...out[type], ...o };
    }
  }
  for (const [type, comps] of Object.entries(overlay)) {
    if (!(type in out)) out[type] = { ...comps };
  }
  return out;
}

/**
 * @param {object} baseTuning COMPONENT_TUNING
 * @param {object|null|undefined} overlay
 */
export function resolveComponentTuning(baseTuning, overlay) {
  if (!overlay || typeof overlay !== 'object') return baseTuning;
  const out = { ...baseTuning };
  for (const [id, tuning] of Object.entries(overlay)) {
    out[id] = out[id] ? { ...out[id], ...tuning } : tuning;
  }
  return out;
}

/**
 * Deterministic ±pct perturbation; sign of each weight preserved.
 * @param {object} mapping
 * @param {{ pct?: number, seed?: number }} [opts]
 */
export function perturbWeights(mapping, { pct = 0.12, seed = 0xC011 } = {}) {
  const rng = createSeededRng(seed);
  const out = {};
  for (const [type, comps] of Object.entries(mapping)) {
    out[type] = {};
    for (const [comp, w] of Object.entries(comps)) {
      const factor = 1 + (rng() * 2 - 1) * pct;
      out[type][comp] = Math.sign(w) * Math.abs(w) * factor;
    }
  }
  return out;
}

/** Default resolved weights (no overlay). */
export function defaultSignalWeights() {
  return SIGNAL_TO_COMPONENTS;
}

/** Default tuning table (no overlay). */
export function defaultComponentTuning() {
  return COMPONENT_TUNING;
}
