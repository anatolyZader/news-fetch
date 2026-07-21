/**
 * Learning-capture record kind vocabulary (OOV / tuning JSONL).
 *
 * Pipeline position: extract and tuning paths — tags rows in oov-capture-*.jsonl
 * for catalog-gap analysis. Client-safe isomorphic.
 *
 * Owns: LEARNING_CAPTURE_KINDS enum and LEARNING_CAPTURE_KIND_SET lookup.
 * Does NOT: capture file I/O, catalog mutation, or assess routing.
 *
 * Key collaborators: learningCaptureRecordHelpers.js, OOV capture writers,
 * tuning review tooling.
 */

/** Closed vocabulary of learning-capture record kinds. */
export const LEARNING_CAPTURE_KINDS = Object.freeze({
  UNKNOWN_TYPE: 'unknown_type',
  SELF_CHECK_UNCERTAIN: 'self_check_uncertain',
  ZERO_SIGNAL_ARTICLE: 'zero_signal_article',
  RESIDUAL_OBSERVATION: 'residual_observation',
  OPEN_OBSERVATION: 'open_observation',
  MAPPING_SKIPPED: 'mapping_skipped',
  VERIFIED_OPEN_OBSERVATION: 'verified_open_observation',
});

/** Set of valid capture_kind strings for fast membership checks. */
export const LEARNING_CAPTURE_KIND_SET = new Set(Object.values(LEARNING_CAPTURE_KINDS));
