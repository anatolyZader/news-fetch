/**
 * Valid operator actions when acknowledging or dismissing pattern recommendations.
 *
 * Pipeline position: operator HTTP surface — parsed from recommendation API
 * requests before persistence or audit logging.
 *
 * Owns: RECOMMENDATION_ACTIONS enum and parseRecommendationAction validator.
 * Does NOT: store recommendation state or render UI (those live in app/ and client/).
 *
 * Key collaborators: operatorRecommendationService, report/operator recommendation routes.
 */

/** Canonical action strings accepted by the operator recommendation API. */
export const RECOMMENDATION_ACTIONS = Object.freeze({
  ACKNOWLEDGE: 'acknowledge',
  DISMISS: 'dismiss',
});

/**
 * Parse and validate a raw action string from an operator recommendation request.
 *
 * @param {string} raw User-supplied action (defaults to empty when missing).
 * @returns {'acknowledge'|'dismiss'|null} Canonical action, or null when unrecognized.
 */
export function parseRecommendationAction(raw) {
  const action = String(raw ?? '').trim().toLowerCase();
  if (action === RECOMMENDATION_ACTIONS.ACKNOWLEDGE) return RECOMMENDATION_ACTIONS.ACKNOWLEDGE;
  if (action === RECOMMENDATION_ACTIONS.DISMISS) return RECOMMENDATION_ACTIONS.DISMISS;
  return null;
}
