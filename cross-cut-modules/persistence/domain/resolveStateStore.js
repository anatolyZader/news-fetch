/**
 * Resolve injectable state store for domain services (defaults to bootstrap singleton).
 */

import { getDefaultStateStore } from './defaultStateStore.js';

/**
 * @param {{ stateStore?: import('./ports/IStateStorePort.js').IStateStorePort }} [deps]
 * @returns {import('./ports/IStateStorePort.js').IStateStorePort}
 */
export function resolveStateStore(deps = {}) {
  return deps.stateStore ?? getDefaultStateStore();
}
