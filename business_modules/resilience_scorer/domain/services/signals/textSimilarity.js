/**
 * Pure text similarity helpers for evidence verification and narrative grounding checks.
 *
 * Pipeline position: assess/verify — shared tokenization and containment metrics for verifiers.
 *
 * Owns: tokenize, normalizeForMatch, jaccard/containment/shingle helpers, quote text resolution.
 * Does NOT: grounding tier assignment (groundingPolicy.js), narrativeGrounding orchestration, or LLM calls.
 *
 * Key collaborators: groundingPolicy.js, openEvidenceVerification.js, textSimilarity consumers in infrastructure/.
 */

/**
 * Lowercased word tokens; keeps Hebrew block, ASCII letters, digits.
 *
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replaceAll(/[^\w\u0590-\u05FF\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * NFKC lowercase; strip punctuation and collapse whitespace for substring checks.
 *
 * @param {string|null|undefined} text
 * @returns {string}
 */
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
 * Resolve quote text from a signal for containment verification.
 *
 * @param {object} signal
 * @returns {string}
 */
export function resolveQuoteText(signal) {
  if (!signal || typeof signal !== 'object') return '';
  const quote = signal.evidence_quote ?? signal.evidence ?? '';
  return typeof quote === 'string' ? quote : '';
}

/**
 * Ordered subsequence containment: fraction of evidence tokens found in order in body tokens.
 *
 * @param {string[]} evTokens
 * @param {string[]} bodyTokens
 * @returns {number} 0–1 containment score
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
 * Jaccard similarity between two token sets.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0–1
 */
export function jaccard(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set)) return 0;
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * k-gram shingle set over a token array.
 *
 * @param {string[]} tokens
 * @param {number} [k=3] shingle width
 * @returns {Set<string>}
 */
export function shingles(tokens, k = 3) {
  if (!Array.isArray(tokens) || tokens.length === 0) return new Set();
  if (tokens.length < k) return new Set([tokens.join(' ')]);
  const out = new Set();
  for (let i = 0; i <= tokens.length - k; i++) {
    out.add(tokens.slice(i, i + k).join(' '));
  }
  return out;
}

/**
 * Containment of set A in set B: |A ∩ B| / |A|.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0–1
 */
export function containment(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set)) return 0;
  if (a.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}
