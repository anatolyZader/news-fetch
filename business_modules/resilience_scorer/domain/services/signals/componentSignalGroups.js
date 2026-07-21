/**
 * Per-component signal grouping — routing, polarity sign, and coverage sets.
 *
 * Pipeline position: assess — after extraction/verification, before component evidence and epistemic profile.
 *
 * Owns: grouping signals by resilience component, polarity sign from routing edges, article/source coverage sets.
 * Does NOT: signal type routing (signalRouting/signalRouter), count-based evidence_basis math, or presence gate rules.
 *
 * Key collaborators: routing/signalRouter.js, signalInstanceSchema.js, ../../epistemic/presenceGates.js, investigationSignalFlags.js.
 */
import { SIGNAL_TO_COMPONENTS, canonicalizeSignalType, getSignalCatalogEntry } from './routing/signalRouter.js';
import { POLARITY_OVERRIDE_SIGNAL_TYPES } from './signalInstanceSchema.js';

/**
 * Polarity sign for one signal on one component.
 * Applies instance-level polarity_override flip when the catalog type allows it.
 *
 * @param {object} signal extracted signal instance
 * @param {string} signalType canonical catalogue type
 * @param {{ polarity: '+'|'-' }} edge mapped component edge from SIGNAL_TO_COMPONENTS
 * @returns {'+'|'-'} effective polarity for this instance on this component
 */
export function signalPolarity(signal, signalType, edge) {
  let polarity = edge.polarity;
  if (POLARITY_OVERRIDE_SIGNAL_TYPES.has(signalType)) {
    const catalog = getSignalCatalogEntry(signalType);
    const override = signal?.polarity_override;
    if (catalog && (override === 'positive' || override === 'negative')
      && override !== catalog.defaultPolarity) {
      polarity = polarity === '+' ? '-' : '+';
    }
  }
  return polarity;
}

/**
 * Stable article key for deduplicating coverage across signals from the same item.
 *
 * @param {object} signal
 * @returns {string|number|null} article_url or article_index, whichever is present
 */
export function articleKeyForSignal(signal) {
  return signal.article_url || (signal.article_index ?? null);
}

/**
 * Collect the signals routed to one component, with polarity and coverage sets.
 * Accepts raw stored signals (legacy alias types are canonicalized here).
 *
 * @param {string} componentId resilience component id
 * @param {Array<object>} signals verified or raw signal instances
 * @param {object} [signalWeights] SIGNAL_TO_COMPONENTS-shaped edge map override
 * @returns {{
 *   items: Array<{ signal: object, signalType: string, polarity: '+'|'-', role: 'primary'|'inferred' }>,
 *   articleSet: Set<string|number>,
 *   sourceSet: Set<string>,
 * }}
 */
export function collectComponentSignals(componentId, signals, signalWeights = null) {
  const weights = signalWeights ?? SIGNAL_TO_COMPONENTS;
  const items = [];
  const articleSet = new Set();
  const sourceSet = new Set();

  for (const signal of signals ?? []) {
    const signalType = canonicalizeSignalType(signal.signal_type ?? signal.type);
    const mapping = weights[signalType];
    if (mapping == null || (componentId in mapping) === false) continue;
    const edge = mapping[componentId];
    items.push({
      signal,
      signalType,
      polarity: signalPolarity(signal, signalType, edge),
      role: edge.role ?? 'primary',
    });

    const articleKey = articleKeyForSignal(signal);
    if (articleKey != null) articleSet.add(articleKey);
    if (signal.source_type) sourceSet.add(signal.source_type);
  }

  return { items, articleSet, sourceSet };
}
