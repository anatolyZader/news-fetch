/**
 * Default filesystem-backed state store (parity with direct node:fs usage).
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';

/** @type {import('../domain/ports/IStateStorePort.js').IStateStorePort | null} */
let defaultStore = null;

/**
 * @returns {import('../domain/ports/IStateStorePort.js').IStateStorePort}
 */
export function createFsStateStoreAdapter() {
  return {
    existsSync,
    readFileSync,
    writeFileSync,
    appendFileSync,
    mkdirSync,
    readdirSync,
    statSync,
  };
}

/**
 * @returns {import('../domain/ports/IStateStorePort.js').IStateStorePort}
 */
export function getDefaultStateStore() {
  if (!defaultStore) {
    defaultStore = createFsStateStoreAdapter();
  }
  return defaultStore;
}
