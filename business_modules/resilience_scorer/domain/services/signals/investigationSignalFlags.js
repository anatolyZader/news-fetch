/**
 * Signal-native presence and salience flags for investigation enrichment.
 */
import { COMPONENT_IDS } from '../../contracts/componentIds.js';
import { collectComponentSignals } from './componentSignalGroups.js';
import { defaultSignalWeights, resolveSignalWeights } from './signalWeights.js';
import { evaluatePresenceGates } from '../../epistemic/presenceGates.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../../epistemic/highSalienceBypass.js';
import { GROUNDING_TIER } from './groundingPolicy.js';

function hasSalientCriticalSignal(items) {
  return items.some((it) =>
    it.signal?.grounding_tier === GROUNDING_TIER.grounded
    && CRITICAL_BYPASS_SIGNAL_TYPES.has(it.signalType));
}

/**
 * @param {object} profile
 * @param {object[]} signals
 * @param {object|null|undefined} _dataVoid
 * @returns {object}
 */
export function applyInvestigationSignalFlags(profile, signals = [], _dataVoid = null) {
  if (!profile?.by_component) return profile;

  const signalWeights = resolveSignalWeights(defaultSignalWeights(), null);

  const byComponent = { ...profile.by_component };
  for (const compId of COMPONENT_IDS) {
    const base = { ...byComponent[compId] };
    const { items } = collectComponentSignals(compId, signals ?? [], signalWeights);
    const presence = evaluatePresenceGates(compId, items);
    base.presence_gate_triggered = presence.triggered === true;
    base.salience_critical = hasSalientCriticalSignal(items);
    byComponent[compId] = base;
  }

  return { ...profile, by_component: byComponent };
}
