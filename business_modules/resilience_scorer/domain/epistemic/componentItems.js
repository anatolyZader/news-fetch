/**
 * Per-component contribution item collection (operator epistemic layer).
 *
 * NOT the same as analyst/scoreSingleComponent.js#collectComponentItems, which
 * skips alias canonicalization (done upstream in scoring) and routes base
 * weights through routedBaseWeight(). Keep them separate — merging changes
 * behavior on one side.
 */
import {
  contributionForSignal,
  duplicateArticleFactor,
  effectiveWeightForSignal,
} from './massContribution.js';
import { canonicalizeSignalType } from '../services/signals/signalRouter.js';

/**
 * @param {string} componentId
 * @param {Array} scoringSignals
 * @param {WeakMap} duplicateIndex
 * @param {object} signalWeights
 */
export function collectComponentItems(componentId, scoringSignals, duplicateIndex, signalWeights) {
  const items = [];
  const articleSet = new Set();
  const sourceSet = new Set();

  for (const signal of scoringSignals) {
    // Stored bundles may carry legacy alias types (e.g. leadership_visible_present);
    // scoring canonicalizes up-front but this pool path receives raw signals.
    const signalType = canonicalizeSignalType(signal.signal_type ?? signal.type);
    const mapping = signalWeights[signalType];
    if (mapping == null || (componentId in mapping) === false) continue;
    const baseWeight = mapping[componentId];
    const effectiveWeight = effectiveWeightForSignal(signal, signalType, baseWeight);
    const preDuplicate = contributionForSignal(signal, baseWeight);
    const k = duplicateIndex.get(signal) ?? 1;
    const contribution = preDuplicate * duplicateArticleFactor(k);
    items.push({
      signal,
      contribution,
      contributionPreDuplicate: preDuplicate,
      polarity: effectiveWeight >= 0 ? '+' : '-',
    });

    const articleKey = signal.article_url || (signal.article_index ?? null);
    if (articleKey != null) articleSet.add(articleKey);
    if (signal.source_type) sourceSet.add(signal.source_type);
  }

  return { items, articleSet, sourceSet };
}
