/**
 * Signal → component routing (Information Expert for catalog lookups and weights).
 * Single facade over the taxonomy (contracts), routing policy, and scoring priors.
 */

export {
  CATALOG_VERSION,
  SIGNAL_CATALOG,
  SIGNAL_DOMAINS,
  SIGNAL_TYPES,
  SIGNAL_ALIASES,
  getSignalCatalogEntry,
  canonicalizeSignalType,
  validateSignalCatalog,
  assertValidSignalCatalog,
} from '../../contracts/signalCatalog.js';
export {
  SIGNAL_TO_COMPONENTS,
  SIGNAL_ROUTING_ROLES,
  getRoutingRole,
  validateSignalRouting,
  assertValidSignalRouting,
} from './signalRouting.js';

import { SIGNAL_TO_COMPONENTS } from './signalRouting.js';
import { canonicalizeSignalType } from '../../contracts/signalCatalog.js';

/**
 * @param {string} signalType
 * @param {string} componentId
 * @returns {number | undefined}
 */
export function getComponentWeight(signalType, componentId) {
  return SIGNAL_TO_COMPONENTS[canonicalizeSignalType(signalType)]?.[componentId];
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
