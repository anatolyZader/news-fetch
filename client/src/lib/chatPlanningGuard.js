const PLANNING_PATTERNS = [
  /I'll search/i,
  /Now let me retrieve/i,
  /Let me search/i,
];

const CITATION_PATTERNS = [
  /source_id/i,
  /https?:\/\//i,
  /\[[^\]]+\]\([^)]+\)/,
];

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isPlanningOnlyReply(text) {
  const body = String(text ?? '').trim();
  if (!body) return false;

  const hasPlanning = PLANNING_PATTERNS.some((re) => re.test(body));
  if (!hasPlanning) return false;

  const hasCitation = CITATION_PATTERNS.some((re) => re.test(body));
  return !hasCitation;
}
