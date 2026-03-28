const URL_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

function sanitizeUrlCandidate(url) {
  return url.replace(/[),.;!?]+$/g, '');
}

/**
 * Classify free-text evidence input into one of:
 * - single_evidence_piece
 * - url_to_important_evidence
 *
 * URL category is used only when the input is exactly one URL (ignoring whitespace).
 * Everything else is treated as a single evidence piece.
 *
 * @param {string} rawInput
 * @returns {{ category: 'single_evidence_piece' | 'url_to_important_evidence', detectedUrl: string | null }}
 */
export function classifyEvidenceInput(rawInput) {
  const input = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!input) {
    return { category: 'single_evidence_piece', detectedUrl: null };
  }

  const urlMatches = Array.from(input.matchAll(URL_REGEX), (m) => sanitizeUrlCandidate(m[0]));
  if (urlMatches.length !== 1) {
    return { category: 'single_evidence_piece', detectedUrl: null };
  }

  const onlyUrlText = input.replace(URL_REGEX, '').trim();
  if (onlyUrlText.length === 0) {
    return { category: 'url_to_important_evidence', detectedUrl: urlMatches[0] };
  }

  return { category: 'single_evidence_piece', detectedUrl: null };
}
