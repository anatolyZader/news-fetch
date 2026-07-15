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
  SIGNAL_ROUTING_ROLES,
  getRoutingRole,
  canonicalizeSignalType,
} from './signalCatalog.js';

import { SIGNAL_TO_COMPONENTS, canonicalizeSignalType } from './signalCatalog.js';

/**
 * @param {string} signalType
 * @param {string} componentId
 * @returns {number | undefined}
 */
export function getComponentWeight(signalType, componentId) {
  return SIGNAL_TO_COMPONENTS[canonicalizeSignalType(signalType)]?.[componentId];
}

/**
 * @param {string} signalType
 * @returns {Record<string, number> | undefined}
 */
export function getComponentWeightsForSignal(signalType) {
  return SIGNAL_TO_COMPONENTS[canonicalizeSignalType(signalType)];
}

/**
 * Whether a signal type has a primary (non-spillover) link to a component.
 * @param {string} signalType
 * @param {string} componentId
 * @returns {boolean}
 */
export function hasStrongComponentLink(signalType, componentId) {
  const weight = getComponentWeight(signalType, componentId);
  return weight == null || Math.abs(weight) >= 0.5;
}
