/**
 * Injectable default state store (domain seam). Wire FS adapter from composition/entry.
 */

import { createFsStateStoreAdapter } from '../infrastructure/fsStateStoreAdapter.js';

/** @type {import('./ports/IStateStorePort.js').IStateStorePort | null} */
let defaultStore = null;

/**
 * @param {import('./ports/IStateStorePort.js').IStateStorePort} store
 */
export function setDefaultStateStore(store) {
  defaultStore = store;
}

/**
 * @returns {import('./ports/IStateStorePort.js').IStateStorePort}
 */
export function getDefaultStateStore() {
  if (!defaultStore) {
    defaultStore = createFsStateStoreAdapter();
  }
  return defaultStore;
}
