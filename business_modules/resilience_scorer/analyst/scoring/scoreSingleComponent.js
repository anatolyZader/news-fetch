import {
  contributionForSignal,
  duplicateArticleFactor,
  effectiveWeightForSignal,
  massBySignalType,
  routedBaseWeight,
} from './scoringShared.js';

/**
 * Collect per-component contribution items and coverage sets from eligible signals.
 *
 * @param {string} componentId
 * @param {Array} scoringSignals
 * @param {WeakMap} duplicateIndex
 * @param {object} signalWeights resolved SIGNAL_TO_COMPONENTS (or overlay)
 * @returns {{ items: Array, articleSet: Set, sourceSet: Set }}
 */
export function collectComponentItems(componentId, scoringSignals, duplicateIndex, signalWeights) {
  const items = [];
  const articleSet = new Set();
  const sourceSet = new Set();

  for (const signal of scoringSignals) {
    const signalType = signal.signal_type ?? signal.type;
    const mapping = signalWeights[signalType];
    if (mapping == null || (componentId in mapping) === false) continue;
    const baseWeight = routedBaseWeight(signalType, componentId, mapping[componentId]);
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

/**
 * Precompute batch-wide type mass (pre-cap) for cross-component derived indicators.
 *
 * @param {Array} scoringSignals
 * @param {WeakMap} duplicateIndex
 * @param {object} signalWeights
 * @returns {Record<string, number>}
 */
export function buildBatchPreCapMassByType(scoringSignals, duplicateIndex, signalWeights) {
  const batchPreCapItems = [];
  for (const signal of scoringSignals) {
    const signalType = signal.signal_type ?? signal.type;
    const mapping = signalWeights[signalType];
    if (mapping == null) continue;
    const firstComponent = Object.keys(mapping)[0];
    const baseWeight = routedBaseWeight(signalType, firstComponent, mapping[firstComponent]);
    const preDuplicate = contributionForSignal(signal, baseWeight);
    const k = duplicateIndex.get(signal) ?? 1;
    batchPreCapItems.push({
      signal,
      contribution: preDuplicate * duplicateArticleFactor(k),
    });
  }
  return massBySignalType(batchPreCapItems);
}
