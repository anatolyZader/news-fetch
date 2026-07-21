/**
 * Signal → component routing facade (Information Expert for catalog + weights).
 *
 * Pipeline position: preferred import surface for other resilience_scorer layers
 * and composition. Re-exports taxonomy (signalCatalog) and routing policy
 * (signalRouting) so callers do not import both trees.
 *
 * Owns: thin lookup helpers getComponentEdge / isPrimaryEdge.
 * Does NOT own: the catalog rows or SIGNAL_TO_COMPONENTS table (re-exported).
 *
 * Prefer this module over deep imports of signalCatalog.js / signalRouting.js
 * unless you are editing those policy files themselves.
 *
 * Key collaborators: signalCatalog.js, signalRouting.js, componentEvidence.js,
 * extraction / assess consumers that need type → component edges.
 */

// --- Re-exports: closed catalog ----------------------------------------------

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

// --- Re-exports: routing map -------------------------------------------------

export {
  SIGNAL_TO_COMPONENTS,
  getRoutingRole,
  validateSignalRouting,
  assertValidSignalRouting,
} from './signalRouting.js';

import { SIGNAL_TO_COMPONENTS } from './signalRouting.js';
import { canonicalizeSignalType } from '../../../contracts/signalCatalog.js';

// --- Edge lookups ------------------------------------------------------------

/**
 * Routing edge for a signal type on one component, or undefined if the type
 * does not route there. Canonicalizes aliases first.
 * @param {string} signalType
 * @param {string} componentId
 * @returns {{ polarity: '+'|'-', role: 'primary'|'inferred' } | undefined}
 */
export function getComponentEdge(signalType, componentId) {
  return SIGNAL_TO_COMPONENTS[canonicalizeSignalType(signalType)]?.[componentId];
}

/**
 * Whether a signal type is a direct (primary-role) observation of a component.
 * Missing edges are treated as primary for historical call-site compatibility.
 * @param {string} signalType
 * @param {string} componentId
 * @returns {boolean}
 */
export function isPrimaryEdge(signalType, componentId) {
  const edge = getComponentEdge(signalType, componentId);
  return edge == null || edge.role === 'primary';
}
