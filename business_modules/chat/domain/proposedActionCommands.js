/**
 * Command registry for propose_* chat tools.
 * Each entry builds a human-readable summary for the pending action.
 * Execution logic lives in executePendingAction.js (PENDING_EXECUTORS).
 *
 * @type {Record<string, (input: object) => { summary: string } | { error: string }>}
 */

const VALIDATION_ACTIONS = new Set([
  'label', 'skip', 'defer', 'gold_signal', 'confirm_social_quarantine', 'dismiss_social_quarantine',
]);

export const PROPOSED_ACTION_SUMMARIES = {
  propose_validation_decision(input) {
    const action = String(input?.action ?? '');
    if (!VALIDATION_ACTIONS.has(action)) {
      return { error: `Invalid action "${action}". Allowed: ${[...VALIDATION_ACTIONS].join(', ')}` };
    }
    return { summary: `Validation: ${action} on ${input.date}/${input.article_key}` };
  },

  propose_geo_unknown_update(input) {
    return { summary: `Geo unknown #${input.id} → ${input.status}` };
  },

  propose_catalog_proposal_review(input) {
    return { summary: `Catalog proposal ${input.proposal_id} → ${input.status}` };
  },

  propose_operator_recommendation(input) {
    const action = String(input?.action ?? '');
    if (action !== 'acknowledge' && action !== 'dismiss') {
      return { error: 'Invalid action. Use acknowledge or dismiss.' };
    }
    return { summary: `Operator recommendation ${input.recommendation_id}: ${action}` };
  },
};
