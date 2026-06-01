/**
 * Read analyst confirmation for social channel quarantine from validation store.
 */

import { getDefaultStateStore } from '../../../../cross-cut-modules/persistence/infrastructure/fsStateStoreAdapter.js';
const stateStore = getDefaultStateStore();
import { resolve } from 'node:path';
import { createValidationReviewSqliteStore } from '../../validation/infrastructure/adapters/validationReviewSqliteStore.js';
import { isValidationReviewSqliteEnabled } from '../../validation/infrastructure/adapters/validationReviewSqliteStore.js';
import {
  SOCIAL_QUARANTINE_ARTICLE_KEY,
} from './socialChannelQuarantine.js';

export const SOCIAL_QUARANTINE_CONFIRM_ACTION = 'confirm_social_quarantine';
export const SOCIAL_QUARANTINE_DISMISS_ACTION = 'dismiss_social_quarantine';

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
 * @returns {import('../../validation/infrastructure/adapters/validationReviewSqliteStore.js').ValidationReviewSqliteStore | null}
 */
export function tryOpenValidationStore(env = process.env) {
  if (!isValidationReviewSqliteEnabled(env)) return null;
  const dbPath = defaultValidationDbPath(env);
  if (!stateStore.existsSync(dbPath)) return null;
  try {
    return createValidationReviewSqliteStore(dbPath);
  } catch {
    return null;
  }
}

/**
 * @param {string} date
 * @param {string} scope
 * @param {import('../../validation/domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort | null} [store]
 */
export function getSocialQuarantineDecision(date, scope, store = null) {
  const s = store ?? tryOpenValidationStore();
  if (!s?.getLatestDecision) return null;
  return s.getLatestDecision(date, scope, SOCIAL_QUARANTINE_ARTICLE_KEY);
}

/**
 * @param {string} date
 * @param {string} scope
 * @param {import('../../validation/domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort | null} [store]
 */
export function isSocialQuarantineActive(date, scope, store = null) {
  const decision = getSocialQuarantineDecision(date, scope, store);
  return decision?.action === SOCIAL_QUARANTINE_CONFIRM_ACTION;
}

/**
 * Analyst dismissed auto OSINT quarantine for this date+scope.
 * @param {string} date
 * @param {string} scope
 * @param {import('../../validation/domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort | null} [store]
 */
export function isSocialQuarantineDismissed(date, scope, store = null) {
  const decision = getSocialQuarantineDecision(date, scope, store);
  return decision?.action === SOCIAL_QUARANTINE_DISMISS_ACTION;
}
