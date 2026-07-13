/**
 * Public facade for the evidence_submission module — user-submitted evidence
 * intake (URL/file/text), source archiving, and optional LLM analysis.
 * Routes live in input/evidenceRoutes.js (wired by composition).
 */
export { classifyEvidenceInput } from './domain/evidenceInputClassifier.js';
export { createEvidenceSubmissionService } from './app/evidenceSubmissionService.js';
export { buildChatSystemHint } from './app/submissionHelpers.js';
