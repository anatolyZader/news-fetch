/**
 * Application wiring for social quarantine validation store access.
 */
import { resolve } from 'node:path';
import { resolveStateStore } from '../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';
import {
  createValidationReviewSqliteStore,
  isValidationReviewSqliteEnabled,
} from '../../analyst/validation/infrastructure/adapters/validationReviewSqliteStore.js';

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function defaultValidationDbPath(env = process.env) {
  const custom = env.SQLITE_PATH?.trim();
  if (custom) return resolve(custom);
  return resolve(process.cwd(), 'db', 'app.sqlite');
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {import('../../analyst/validation/infrastructure/adapters/validationReviewSqliteStore.js').ValidationReviewSqliteStore | null}
 */
export function tryOpenValidationStore(env = process.env) {
  if (!isValidationReviewSqliteEnabled(env)) return null;
  const dbPath = defaultValidationDbPath(env);
  if (!resolveStateStore().existsSync(dbPath)) return null;
  try {
    return createValidationReviewSqliteStore(dbPath);
  } catch {
    return null;
  }
}
