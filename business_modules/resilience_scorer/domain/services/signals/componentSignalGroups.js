/**
 * Per-component signal grouping — routing + polarity sign + coverage sets.
 *
 * Count-based successor to the mass-contribution item collectors: no evidence
 * mass, no duplicate-article discounting, no weight magnitudes. A signal either
 * routes to a component (its type has a weight there) or it doesn't; polarity
 * is the sign of that weight, flipped by an instance-level polarity_override
 * when the catalog allows one.
 */
import { canonicalizeSignalType, getSignalCatalogEntry } from './routing/signalRouter.js';
import { POLARITY_OVERRIDE_SIGNAL_TYPES } from './signalInstanceSchema.js';
import { resolveSignalWeights, defaultSignalWeights } from './routing/signalWeights.js';

/**
 * Polarity sign for one signal on one component.
 * @param {object} signal
 * @param {string} signalType canonical type
 * @param {number} baseWeight mapped component weight
 * @returns {'+'|'-'}
 */
export function signalPolarity(signal, signalType, baseWeight) {
  let weight = baseWeight;
  if (POLARITY_OVERRIDE_SIGNAL_TYPES.has(signalType)) {
    const catalog = getSignalCatalogEntry(signalType);
    const override = signal?.polarity_override;
    if (catalog && (override === 'positive' || override === 'negative')
      && override !== catalog.defaultPolarity) {
      weight = -weight;
    }
  }
  return weight >= 0 ? '+' : '-';
}

/**
 * @param {object} signal
 * @returns {string|null}
 */
export function articleKeyForSignal(signal) {
  return signal.article_url || (signal.article_index ?? null);
}

/**
 * Collect the signals routed to one component, with polarity and coverage sets.
 * Accepts raw stored signals (legacy alias types are canonicalized here).
 *
 * @param {string} componentId
 * @param {Array<object>} signals
 * @param {object} [signalWeights] resolved SIGNAL_TO_COMPONENTS (or overlay)
 * @returns {{
 *   items: Array<{ signal: object, signalType: string, polarity: '+'|'-' }>,
 *   articleSet: Set<string|number>,
 *   sourceSet: Set<string>,
 * }}
 */
export function collectComponentSignals(componentId, signals, signalWeights = null) {
  const weights = signalWeights ?? resolveSignalWeights(defaultSignalWeights(), null);
  const items = [];
  const articleSet = new Set();
  const sourceSet = new Set();

  for (const signal of signals ?? []) {
    const signalType = canonicalizeSignalType(signal.signal_type ?? signal.type);
    const mapping = weights[signalType];
    if (mapping == null || (componentId in mapping) === false) continue;
    items.push({
      signal,
      signalType,
      polarity: signalPolarity(signal, signalType, mapping[componentId]),
    });

    const articleKey = articleKeyForSignal(signal);
    if (articleKey != null) articleSet.add(articleKey);
    if (signal.source_type) sourceSet.add(signal.source_type);
  }

  return { items, articleSet, sourceSet };
}
