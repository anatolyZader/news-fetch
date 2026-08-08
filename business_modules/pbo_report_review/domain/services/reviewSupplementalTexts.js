/**
 * Merge PBO review replies into supplemental text maps (pure, no I/O).
 */

/**
 * @param {Record<string, string>} supplementalTexts
 * @param {string} gapId
 * @param {string} text
 */
export function mergeGapAnswer(supplementalTexts, gapId, text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || !String(gapId).includes(':')) return;
  const componentId = String(gapId).split(':')[0];
  if (!componentId) return;
  supplementalTexts[componentId] = supplementalTexts[componentId]
    ? `${supplementalTexts[componentId]} | ${trimmed}`
    : trimmed;
}

/**
 * @param {Array<object>} replies
 * @returns {Record<string, string>}
 */
export function collectSupplementalTextsFromReplies(replies) {
  const merged = {};
  for (const reply of replies ?? []) {
    for (const ans of reply.answers ?? []) {
      mergeGapAnswer(merged, ans.gapId, ans.text);
    }
    if (reply.rawText && reply.channel === 'email') {
      const fallback = String(reply.rawText).trim();
      if (fallback && !Object.keys(merged).length) {
        merged._email_body = fallback;
      }
    }
  }
  return merged;
}

/**
 * Municipal review states.
 *
 * `unreviewed` is deliberately distinct from `reviewed_incomplete`: "nobody has
 * looked at this municipality yet" is not a verdict on its evidence. Collapsing
 * the two (as the pre-2026-06-20 extractor did, defaulting every unreviewed
 * municipality to `incomplete`) makes a review backlog indistinguishable from a
 * quality finding, and would floor confidence on every PBO-dominated component.
 */
export const PBO_REVIEW_STATE = Object.freeze({
  reviewed_sufficient: 'reviewed_sufficient',
  reviewed_incomplete: 'reviewed_incomplete',
  unreviewed: 'unreviewed',
});

/**
 * @param {{ sufficient?: boolean, status?: string }|null|undefined} review
 * @returns {'reviewed_sufficient'|'reviewed_incomplete'|'unreviewed'}
 */
export function pboCompletenessLabel(review) {
  if (!review) return PBO_REVIEW_STATE.unreviewed;
  return review.sufficient || review.status === 'resolved'
    ? PBO_REVIEW_STATE.reviewed_sufficient
    : PBO_REVIEW_STATE.reviewed_incomplete;
}

/**
 * @param {{ sufficient?: boolean, status?: string, municipality?: string }} review
 * @param {Record<string, string>} supplementalTexts
 */
export function reviewMetadataEntry(review, supplementalTexts) {
  const reviewState = pboCompletenessLabel(review);
  return {
    pbo_review_state: reviewState,
    pbo_review_status: review.status,
    pbo_evidence_thin: reviewState === PBO_REVIEW_STATE.reviewed_incomplete,
    supplementalTexts,
  };
}
