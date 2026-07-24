/**
 * Text utilities for narrative grounding overlap and connective checks.
 *
 * Pipeline position: used by sentenceGroundingChecker and narrativeSchemaValidator
 * during post-hoc QA of generated prose vs cited evidence.
 *
 * Owns: sentence splitting, forbidden connective detection, token overlap scoring.
 * Does NOT: resolve signal refs or call LLMs.
 *
 * Key collaborators: `signals/textSimilarity.js`, `sentenceGroundingChecker.js`,
 * `narrativeSchemaValidator.js`.
 */

import {
  jaccard,
  orderedSubsequenceContainment,
  tokenize,
} from '../signals/textSimilarity.js';

// ── Connective policy ─────────────────────────────────────────────────────────

/** Causal connectives disallowed when linking unrelated signal refs in one sentence. */
export const FORBIDDEN_CONNECTIVES = [
  'because',
  'therefore',
  'as a result',
  'led to',
  'driven by',
  'in response to',
  'despite',
  'due to',
  'consequently',
  'thus',
  'hence',
  'so that',
];

// ── Sentence utilities ──────────────────────────────────────────────────────────

/**
 * Split prose into sentences on punctuation and newlines.
 *
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Find forbidden causal connectives present in text.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function findForbiddenConnectives(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return FORBIDDEN_CONNECTIVES.filter((c) => lower.includes(c));
}

// ── Overlap scoring ───────────────────────────────────────────────────────────

/**
 * Overlap score 0..1 between narrative text and evidence string.
 *
 * @param {string} text
 * @param {string} evidenceText
 * @returns {number}
 */
function textOverlapScore(text, evidenceText) {
  const a = tokenize(text);
  const b = tokenize(evidenceText);
  if (a.length === 0 || b.length === 0) return 0;
  const subseq = orderedSubsequenceContainment(a, b);
  const jac = jaccard(new Set(a), new Set(b));
  return Math.max(subseq, jac);
}

/**
 * Best overlap score across multiple evidence strings.
 *
 * @param {string} text
 * @param {string[]} evidenceTexts
 * @returns {number}
 */
export function bestEvidenceOverlap(text, evidenceTexts) {
  let best = 0;
  for (const ev of evidenceTexts ?? []) {
    if (!ev) continue;
    const score = textOverlapScore(text, ev);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Strip markdown links before overlap checks.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdownLinks(text) {
  return String(text ?? '').replaceAll(/\(\[[^\]]*\]\([^)]*\)\)/g, '').trim();
}
