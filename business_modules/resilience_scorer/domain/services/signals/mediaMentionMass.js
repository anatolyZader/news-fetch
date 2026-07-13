/**
 * Press-only mention mass per component (information environment metric).
 */
import { COMPONENT_IDS } from '../../contracts/componentIds.js';
import { defaultSignalWeights, resolveSignalWeights } from './signalWeights.js';

const PRESS_SOURCE_TYPES = new Set(['news', 'radio']);

/**
 * @param {object[]} allSignals
 * @param {object} [signalWeights]
 * @returns {Record<string, number>}
 */
export function computeMediaMentionMass(allSignals, signalWeights = defaultSignalWeights()) {
  const weights = resolveSignalWeights(signalWeights, null);
  const byComp = Object.fromEntries(COMPONENT_IDS.map((id) => [id, 0]));
  for (const signal of allSignals ?? []) {
    if (PRESS_SOURCE_TYPES.has(signal?.source_type) === false) continue;
    const signalType = signal.signal_type ?? signal.type;
    const mapping = weights[signalType];
    if (mapping == null) continue;
    for (const [compId, w] of Object.entries(mapping)) {
      if (compId in byComp) {
        byComp[compId] += Math.abs(w) * (signal.extraction_confidence ?? 0.85);
      }
    }
  }
  return byComp;
}
