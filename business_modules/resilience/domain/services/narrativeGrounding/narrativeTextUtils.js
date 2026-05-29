/**
 * Text utilities for narrative grounding checks.
 */

import {
  jaccard,
  orderedSubsequenceContainment,
  tokenize,
} from '../../../infrastructure/signalVerification.js';

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

/**
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
 * @param {string} text
 * @returns {string[]}
 */
export function findForbiddenConnectives(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return FORBIDDEN_CONNECTIVES.filter((c) => lower.includes(c));
}

/**
 * Overlap score 0..1 between narrative text and evidence string.
 * @param {string} text
 * @param {string} evidenceText
 */
export function textOverlapScore(text, evidenceText) {
  const a = tokenize(text);
  const b = tokenize(evidenceText);
  if (a.length === 0 || b.length === 0) return 0;
  const subseq = orderedSubsequenceContainment(a, b);
  const jac = jaccard(new Set(a), new Set(b));
  return Math.max(subseq, jac);
}

/**
 * @param {string} text
 * @param {string[]} evidenceTexts
 * @param {number} [minOverlap]
 */
export function bestEvidenceOverlap(text, evidenceTexts, minOverlap = 0) {
  let best = 0;
  for (const ev of evidenceTexts ?? []) {
    if (!ev) continue;
    const score = textOverlapScore(text, ev);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Strip markdown links for overlap checks.
 * @param {string} text
 */
export function stripMarkdownLinks(text) {
  return String(text ?? '').replace(/\(\[[^\]]*\]\([^)]*\)\)/g, '').trim();
}
