/**
 * Signal-to-component weight resolution (operator — no tuning overlays).
 */
import { SIGNAL_TO_COMPONENTS } from '../services/signals/signalCatalog.js';

/**
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

export function defaultSignalWeights() {
  return SIGNAL_TO_COMPONENTS;
}
