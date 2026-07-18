/**
 * Command registry for propose_* chat tools.
 * Each entry builds a human-readable summary for the pending action.
 * Execution logic lives in executePendingAction.js (PENDING_EXECUTORS).
 *
 * @type {Record<string, (input: object) => { summary: string } | { error: string }>}
 */

export const PROPOSED_ACTION_SUMMARIES = {
  propose_geo_unknown_update(input) {
    return { summary: `Geo unknown #${input.id} → ${input.status}` };
  },

  propose_operator_recommendation(input) {
    const action = String(input?.action ?? '');
    if (action !== 'acknowledge' && action !== 'dismiss') {
      return { error: 'Invalid action. Use acknowledge or dismiss.' };
    }
    return { summary: `Operator recommendation ${input.recommendation_id}: ${action}` };
  },
};
