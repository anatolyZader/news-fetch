/**
 * Signal-native presence and salience flags for investigation enrichment.
 *
 * Pipeline position: assess — enriches epistemic profile after signals are scoped and verified.
 *
 * Owns: per-component presence_gate_triggered and salience_critical flags derived from routed signals.
 * Does NOT: presence gate rule definitions (../../epistemic/presenceGates.js), routing, or narrative synthesis.
 *
 * Key collaborators: componentSignalGroups.js, ../../epistemic/presenceGates.js, groundingPolicy.js, ../../epistemic/highSalienceBypass.js.
 */
import { COMPONENT_IDS } from '../../contracts/componentIds.js';
import { collectComponentSignals } from './componentSignalGroups.js';
import { evaluatePresenceGates } from '../../epistemic/presenceGates.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../../epistemic/highSalienceBypass.js';
import { GROUNDING_TIER } from './groundingPolicy.js';

function hasSalientCriticalSignal(items) {
  return items.some((it) =>
    it.signal?.grounding_tier === GROUNDING_TIER.grounded
    && CRITICAL_BYPASS_SIGNAL_TYPES.has(it.signalType));
}

/**
 * Attach presence_gate_triggered and salience_critical to each component in an epistemic profile.
 *
 * @param {object} profile epistemic profile with by_component map
 * @param {object[]} signals scoped/verified signal instances
 * @param {object|null|undefined} _dataVoid reserved; unused
 * @returns {object} profile copy with investigation flags merged into by_component
 */
export function applyInvestigationSignalFlags(profile, signals = [], _dataVoid = null) {
  if (!profile?.by_component) return profile;

  const byComponent = { ...profile.by_component };
  for (const compId of COMPONENT_IDS) {
    const base = { ...byComponent[compId] };
    const { items } = collectComponentSignals(compId, signals ?? []);
    const presence = evaluatePresenceGates(compId, items);
    base.presence_gate_triggered = presence.triggered === true;
    base.salience_critical = hasSalientCriticalSignal(items);
    byComponent[compId] = base;
  }

  return { ...profile, by_component: byComponent };
}
