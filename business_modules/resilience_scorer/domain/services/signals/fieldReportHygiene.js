/**
 * Post-extract cleanup for PBO and field-report signals.
 *
 * Pipeline position: extract/assess — hygiene pass before verification and scope filtering.
 *
 * Owns: trivial-evidence drop, officer score-blob stripping, misclassified type rewrite on field reports.
 * Does NOT: catalogue routing (routing/signalTypeHygiene.js owns rewrite rules), or gaming/grounding policy.
 *
 * Key collaborators: routing/signalTypeHygiene.js, fieldSignalPolicy.js, visitsSourceType.js, harmInfrastructureSplit.js.
 */
import { rewriteMisclassifiedSignalType } from './routing/signalTypeHygiene.js';

const TRIVIAL_FIELD_REPORT_EVIDENCE_RE = /^(אין|ללא שינוי|אותו דבר|אותו הדבר|none|n\/a|—|-|\.)$/i;

const AVG_SCORE_BLOB_RE = /\[([^\]]+)\]\s*[^:]+:\s*avg=\d+%(?:\s*\([^)]*\))?\s*(?:—\s*)?/gi;

/**
 * Whether field-report evidence text is too short or boilerplate to retain as a signal.
 *
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isTrivialFieldReportEvidence(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return true;
  if (trimmed.length < 3) return true;
  if (TRIVIAL_FIELD_REPORT_EVIDENCE_RE.test(trimmed)) return true;
  const afterMuni = trimmed.replace(/^\[[^\]]+\]\s*/, '').trim();
  if (TRIVIAL_FIELD_REPORT_EVIDENCE_RE.test(afterMuni)) return true;
  return false;
}

/**
 * Strip officer score-summary blobs from evidence; return substantive remainder.
 *
 * @param {string} evidence raw evidence text
 * @returns {string} cleaned evidence string
 */
export function stripFieldReportScoreBlob(evidence) {
  let out = String(evidence ?? '');
  out = out.replaceAll(AVG_SCORE_BLOB_RE, '');
  out = out.replaceAll(/\bavg=\d+%(?:\s*\([^)]*\))?/gi, '');
  return out.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Sanitize one field-report signal; returns null when evidence is trivial after cleanup.
 *
 * @param {object} signal
 * @returns {object|null} cleaned signal or null if dropped
 */
export function sanitizeFieldReportSignal(signal) {
  if (!signal || typeof signal !== 'object') return null;

  let evidence = stripFieldReportScoreBlob(signal.evidence ?? '');
  const signalType = rewriteMisclassifiedSignalType(signal.signal_type ?? signal.type, evidence);

  if (isTrivialFieldReportEvidence(evidence)) return null;

  return {
    ...signal,
    signal_type: signalType,
    type: signalType,
    evidence,
  };
}

/**
 * Apply field-report hygiene to a signal array; drops signals that fail sanitization.
 *
 * @param {object[]} signals
 * @returns {object[]} retained signals
 */
export function applyFieldReportSignalHygiene(signals) {
  if (!Array.isArray(signals)) return [];
  const out = [];
  for (const signal of signals) {
    const cleaned = sanitizeFieldReportSignal(signal);
    if (cleaned) out.push(cleaned);
  }
  return out;
}
