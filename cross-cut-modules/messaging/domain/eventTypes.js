/**
 * Typed domain event names (no magic strings at publish sites).
 */

export const EVENT_TYPES = Object.freeze({
  RESILIENCE_REPORT_WRITTEN: 'resilience.report.written',
  EVIDENCE_SUBMISSION_COMPLETED: 'evidence.submission.completed',
  PBO_REVIEW_INBOUND_RECEIVED: 'pbo.review.inbound.received',
  MAILING_DIGEST_REQUESTED: 'mailing.digest.requested',
});

/** @typedef {typeof EVENT_TYPES[keyof typeof EVENT_TYPES]} EventType */
