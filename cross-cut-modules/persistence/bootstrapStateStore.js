/**
 * Call once at process entry (server, CLIs) before domain code reads filesystem state.
 */
import { setDefaultStateStore } from './domain/defaultStateStore.js';
import { createFsStateStoreAdapter } from './infrastructure/fsStateStoreAdapter.js';

export function bootstrapDefaultStateStore() {
  setDefaultStateStore(createFsStateStoreAdapter());
}
