/**
 * Learning-capture record helpers for OOV JSONL clustering and display.
 *
 * Pipeline position: tuning and review tooling — pure transforms on capture rows.
 * Client-safe isomorphic.
 *
 * Owns: cluster keys, evidence text extraction, source-density classifiers.
 * Does NOT: JSONL I/O, catalog updates, or assess routing.
 *
 * Key collaborators: learningCaptureKinds.js, OOV capture review UI, tuning scripts.
 */
import { LEARNING_CAPTURE_KINDS } from './learningCaptureKinds.js';

/**
 * Derive a stable cluster key for grouping similar capture records in review UI.
 * @param {object} record
 * @returns {string}
 */
export function clusterKeyForRecord(record) {
  if (record.capture_kind === LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE) {
    return String(record.suggested_type ?? 'unknown_type').toLowerCase().trim();
  }
  if (record.capture_kind === LEARNING_CAPTURE_KINDS.SELF_CHECK_UNCERTAIN) {
    return `uncertain:${record.signal_type ?? 'unknown'}`;
  }
  if (record.capture_kind === LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION) {
    return String(record.behavioral_description ?? record.evidence ?? 'residual').slice(0, 80);
  }
  if (record.capture_kind === LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION) {
    return String(record.behavioral_description ?? record.evidence ?? 'open').slice(0, 80);
  }
  return String(record.evidence ?? record.snippet ?? record.suggested_type ?? 'unknown').slice(0, 80);
}

/**
 * Best-effort evidence text from a capture record for display or dedup.
 * @param {object} record
 * @returns {string}
 */
export function evidenceTextForRecord(record) {
  return String(
    record.evidence
    ?? record.snippet
    ?? record.behavioral_description
    ?? record.suggested_type
    ?? '',
  ).trim();
}

/**
 * Human-readable capture kind label with unknown_type fallback.
 * @param {object} record
 * @returns {string}
 */
export function captureKindLabel(record) {
  return record.capture_kind ?? LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE;
}

/**
 * Classify a source label into a coarse density bucket for review clustering.
 * @param {string} sourceLabel
 * @returns {'field' | 'social' | 'news' | 'radio' | 'default'}
 */
export function inferSourceDensityClass(sourceLabel) {
  const label = String(sourceLabel ?? '').toLowerCase();
  if (label.includes('field') || label.includes('pbo') || label.includes('whatsapp')) return 'field';
  if (label.includes('social')) return 'social';
  if (label.includes('radio')) return 'radio';
  if (label.includes('news') || label.includes('ynet') || label.includes('media')) return 'news';
  return 'default';
}

/**
 * Pick the dominant source-density class across a batch of capture records.
 * @param {Array<object>} records
 * @returns {'field' | 'social' | 'news' | 'radio' | 'default'}
 */
export function inferDominantSourceClass(records) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const rec of records) {
    const cls = inferSourceDensityClass(rec.source_label);
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  let best = 'default';
  let bestN = 0;
  for (const [cls, n] of counts) {
    if (n > bestN) {
      best = cls;
      bestN = n;
    }
  }
  return best;
}
