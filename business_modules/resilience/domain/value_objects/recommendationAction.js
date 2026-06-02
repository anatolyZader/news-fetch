export const RECOMMENDATION_ACTIONS = Object.freeze({
  ACKNOWLEDGE: 'acknowledge',
  DISMISS: 'dismiss',
});

/**
 * @param {string} raw
 * @returns {'acknowledge'|'dismiss'|null}
 */
export function parseRecommendationAction(raw) {
  const action = String(raw ?? '').trim().toLowerCase();
  if (action === RECOMMENDATION_ACTIONS.ACKNOWLEDGE) return RECOMMENDATION_ACTIONS.ACKNOWLEDGE;
  if (action === RECOMMENDATION_ACTIONS.DISMISS) return RECOMMENDATION_ACTIONS.DISMISS;
  return null;
}
