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

export { getDefaultStateStore, setDefaultStateStore } from '../domain/defaultStateStore.js';
