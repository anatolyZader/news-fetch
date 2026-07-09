/**
 * Read analyst confirmation for social channel quarantine from validation store.
 */

import { SOCIAL_QUARANTINE_ARTICLE_KEY } from './socialChannelQuarantine.js';

export const SOCIAL_QUARANTINE_CONFIRM_ACTION = 'confirm_social_quarantine';
export const SOCIAL_QUARANTINE_DISMISS_ACTION = 'dismiss_social_quarantine';

/**
 * @param {string} date
 * @param {string} scope
 * @param {import('../../analyst/validation/domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort | null} [store]
 */
export function getSocialQuarantineDecision(date, scope, store = null) {
  if (!store?.getLatestDecision) return null;
  return store.getLatestDecision(date, scope, SOCIAL_QUARANTINE_ARTICLE_KEY);
}

/**
 * @param {string} date
 * @param {string} scope
 * @param {import('../../analyst/validation/domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort | null} [store]
 */
export function isSocialQuarantineActive(date, scope, store = null) {
  const decision = getSocialQuarantineDecision(date, scope, store);
  return decision?.action === SOCIAL_QUARANTINE_CONFIRM_ACTION;
}

/**
 * @param {string} date
 * @param {string} scope
 * @param {import('../../analyst/validation/domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort | null} [store]
 */
export function isSocialQuarantineDismissed(date, scope, store = null) {
  const decision = getSocialQuarantineDecision(date, scope, store);
  return decision?.action === SOCIAL_QUARANTINE_DISMISS_ACTION;
}
