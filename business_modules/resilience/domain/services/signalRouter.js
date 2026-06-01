/**
 * Signal → component routing (Information Expert for catalog lookups and weights).
 */

export {
  SIGNAL_CATALOG,
  SIGNAL_TYPES,
  CATALOG_VERSION,
  SIGNAL_DOMAINS,
  DEFAULT_SCORING_PRIORS,
  getSignalCatalogEntry,
  getScoringPriors,
  SIGNAL_TO_COMPONENTS,
} from './signalCatalog.js';

import { SIGNAL_TO_COMPONENTS } from './signalCatalog.js';

/**
 * @param {string} signalType
 * @param {string} componentId
 * @returns {number | undefined}
 */
export function getComponentWeight(signalType, componentId) {
  return SIGNAL_TO_COMPONENTS[signalType]?.[componentId];
}

/**
 * @param {string} signalType
 * @returns {Record<string, number> | undefined}
 */
export function getComponentWeightsForSignal(signalType) {
  return SIGNAL_TO_COMPONENTS[signalType];
}
