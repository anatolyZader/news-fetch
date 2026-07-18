/**
 * Post-extract cleanup for PBO / field-report signals.
 */
import { rewriteMisclassifiedSignalType } from './signalTypeHygiene.js';

const TRIVIAL_FIELD_REPORT_EVIDENCE_RE = /^(אין|ללא שינוי|אותו דבר|אותו הדבר|none|n\/a|—|-|\.)$/i;

const AVG_SCORE_BLOB_RE = /\[([^\]]+)\]\s*[^:]+:\s*avg=\d+%(?:\s*\([^)]*\))?\s*(?:—\s*)?/gi;

/**
 * @param {string | null | undefined} text
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
 * Strip officer score-summary blobs; return substantive remainder.
 * @param {string} evidence
 * @returns {string}
 */
export function stripFieldReportScoreBlob(evidence) {
  let out = String(evidence ?? '');
  out = out.replaceAll(AVG_SCORE_BLOB_RE, '');
  out = out.replaceAll(/\bavg=\d+%(?:\s*\([^)]*\))?/gi, '');
  return out.replaceAll(/\s+/g, ' ').trim();
}

/**
 * @param {object} signal
 * @returns {object | null}
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
 * @param {object[]} signals
 * @returns {object[]}
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
