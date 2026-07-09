/**
 * Signal-native presence and salience flags for investigation enrichment.
 */
import { COMPONENT_IDS } from '../../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { applySourceCap } from '../../epistemic/evidenceCaps.js';
import { buildDuplicateOccurrenceIndex } from '../../epistemic/massContribution.js';
import { collectComponentItems } from '../../epistemic/componentItems.js';
import { defaultSignalWeights, resolveSignalWeights } from './signalWeights.js';
import { evaluatePresenceGates } from '../../epistemic/presenceGates.js';
import { isComponentSalienceCritical } from '../../epistemic/highSalienceBypass.js';

function sumEvidenceMass(items) {
  return (items ?? []).reduce((s, it) => s + Math.abs(it.contribution ?? 0), 0);
}

/**
 * @param {object} profile
 * @param {object[]} signals
 * @param {object|null|undefined} dataVoid
 * @returns {object}
 */
export function applyInvestigationSignalFlags(profile, signals = [], dataVoid = null) {
  if (!profile?.by_component) return profile;

  const signalWeights = resolveSignalWeights(defaultSignalWeights(), null);
  const duplicateIndex = buildDuplicateOccurrenceIndex(signals ?? []);
  const salienceOpts = {
    dataVoidLevel: dataVoid?.level,
    digitalDarkness: dataVoid?.digital_darkness === true,
  };

  const byComponent = { ...profile.by_component };
  for (const compId of COMPONENT_IDS) {
    const base = { ...byComponent[compId] };
    const { items } = collectComponentItems(compId, signals ?? [], duplicateIndex, signalWeights);
    const cappedItems = applySourceCap(items);
    const presence = evaluatePresenceGates(compId, cappedItems);
    base.presence_gate_triggered = presence.triggered === true;
    base.salience_critical = isComponentSalienceCritical(
      cappedItems,
      sumEvidenceMass(cappedItems),
      salienceOpts,
    );
    byComponent[compId] = base;
  }

  return { ...profile, by_component: byComponent };
}
