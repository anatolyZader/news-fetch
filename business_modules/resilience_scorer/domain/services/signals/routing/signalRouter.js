/**
 * Signal → component routing facade (Information Expert for catalog + weights).
 *
 * Pipeline position: preferred import surface for other resilience_scorer layers
 * and composition. Re-exports taxonomy (signalCatalog) and routing policy
 * (signalRouting) so callers do not import both trees.
 *
 * Owns: thin lookup helpers getComponentWeight / hasStrongComponentLink.
 * Does NOT own: the catalog rows or SIGNAL_TO_COMPONENTS table (re-exported).
 *
 * Prefer this module over deep imports of signalCatalog.js / signalRouting.js
 * unless you are editing those policy files themselves.
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
} from '../../../contracts/signalCatalog.js';
export {
  SIGNAL_TO_COMPONENTS,
  SIGNAL_ROUTING_ROLES,
  getRoutingRole,
  validateSignalRouting,
  assertValidSignalRouting,
} from './signalRouting.js';

import { SIGNAL_TO_COMPONENTS } from './signalRouting.js';
import { canonicalizeSignalType } from '../../../contracts/signalCatalog.js';

/**
 * Signed routing prior for a signal type on one component, or undefined if
 * the type does not route there. Canonicalizes aliases first.
 * @param {string} signalType
 * @param {string} componentId
 * @returns {number | undefined}
 */
export function getComponentWeight(signalType, componentId) {
  return SIGNAL_TO_COMPONENTS[canonicalizeSignalType(signalType)]?.[componentId];
}

/**
 * Whether a signal type has a non-trivial (primary-strength) link to a
 * component: |weight| >= 0.5. Missing edges are treated as "strong" for
 * historical call-site compatibility (weight == null → true).
 * @param {string} signalType
 * @param {string} componentId
 * @returns {boolean}
 */
export function hasStrongComponentLink(signalType, componentId) {
  const weight = getComponentWeight(signalType, componentId);
  return weight == null || Math.abs(weight) >= 0.5;
}
