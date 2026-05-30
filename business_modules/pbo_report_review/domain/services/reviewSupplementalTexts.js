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
 * @param {{ sufficient?: boolean, status?: string }} review
 * @returns {'complete'|'incomplete'}
 */
export function pboCompletenessLabel(review) {
  return review.sufficient || review.status === 'resolved' ? 'complete' : 'incomplete';
}

/**
 * @param {{ sufficient?: boolean, status?: string, municipality?: string }} review
 * @param {Record<string, string>} supplementalTexts
 */
export function reviewMetadataEntry(review, supplementalTexts) {
  const pboCompleteness = pboCompletenessLabel(review);
  return {
    pbo_completeness: pboCompleteness,
    pbo_review_status: review.status,
    pbo_evidence_thin: pboCompleteness === 'incomplete',
    supplementalTexts,
  };
}
