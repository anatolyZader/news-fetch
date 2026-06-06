/**
 * Pure text similarity helpers for narrative grounding and signal verification.
 */

/**
 * Lowercased word tokens; keeps Hebrew block, ASCII letters, digits.
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replaceAll(/[^\w\u0590-\u05FF\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** NFKC lowercase; strip punctuation and collapse whitespace for substring checks. */
export function normalizeForMatch(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[^\w\u0590-\u05FF\s]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object} signal
 * @returns {string}
 */
export function resolveQuoteText(signal) {
  if (!signal || typeof signal !== 'object') return '';
  const quote = signal.evidence_quote ?? signal.evidence ?? '';
  return typeof quote === 'string' ? quote : '';
}

/**
 * @param {string[]} evTokens
 * @param {string[]} bodyTokens
 * @returns {number}
 */
export function orderedSubsequenceContainment(evTokens, bodyTokens) {
  if (!evTokens.length || !bodyTokens.length) return 0;
  let j = 0;
  for (const t of bodyTokens) {
    if (t === evTokens[j]) j++;
    if (j === evTokens.length) return 1;
  }
  return j / evTokens.length;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
export function jaccard(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set)) return 0;
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
