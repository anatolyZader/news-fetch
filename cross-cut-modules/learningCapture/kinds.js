/**
 * Shared learning-capture record kinds (daily_reports/oov-capture-*.jsonl).
 */
export const LEARNING_CAPTURE_KINDS = Object.freeze({
  UNKNOWN_TYPE: 'unknown_type',
  SELF_CHECK_UNCERTAIN: 'self_check_uncertain',
  ZERO_SIGNAL_ARTICLE: 'zero_signal_article',
  RESIDUAL_OBSERVATION: 'residual_observation',
  OPEN_OBSERVATION: 'open_observation',
  MAPPING_SKIPPED: 'mapping_skipped',
  VERIFIED_OPEN_OBSERVATION: 'verified_open_observation',
});

/** @type {Set<string>} */
export const LEARNING_CAPTURE_KIND_SET = new Set(Object.values(LEARNING_CAPTURE_KINDS));
