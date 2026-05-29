/**
 * Helpers for learning-capture records (OOV JSONL).
 */
import { LEARNING_CAPTURE_KINDS } from './kinds.js';

/**
 * @param {object} record
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
  return String(record.evidence ?? record.snippet ?? record.suggested_type ?? 'unknown').slice(0, 80);
}

/**
 * @param {object} record
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
 * @param {object} record
 */
export function captureKindLabel(record) {
  return record.capture_kind ?? LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE;
}

/**
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
