/**
 * Learning capture record helpers for catalog gap clustering.
 */
export {
  LEARNING_CAPTURE_KINDS,
  LEARNING_CAPTURE_KIND_SET,
} from '../../../../cross-cut-modules/learningCapture/kinds.js';

import { LEARNING_CAPTURE_KINDS } from '../../../../cross-cut-modules/learningCapture/kinds.js';

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
