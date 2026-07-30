/**
 * Chat agent feature flags.
 * Invariant: state mutations use propose_* tools only (see chatToolMutations.test.js).
 */

export function chatAnalystToolsEnabled() {
  return process.env.CHAT_ANALYST_TOOLS_ENABLED !== '0';
}

export function chatConfirmActionsEnabled() {
  return process.env.CHAT_CONFIRM_ACTIONS_ENABLED !== '0';
}

export function validationAgentEnabled() {
  return process.env.VALIDATION_AGENT_ENABLED !== '0';
}

export function catalogProposalLlmEnabled() {
  return process.env.CATALOG_PROPOSAL_LLM_ENABLED !== '0';
}

export function geoUnknownReviewReadEnabled() {
  return process.env.GEO_UNKNOWN_REVIEW_READ_ENABLED !== '0';
}

export function chatCompressToolsEnabled() {
  return process.env.CHAT_COMPRESS_TOOLS !== '0';
}

/** Token-level SSE streaming of chat text (CHAT_STREAM_DELTAS=0 to fall back to block emission). */
export function chatStreamDeltasEnabled() {
  return process.env.CHAT_STREAM_DELTAS !== '0';
}

/** Deterministic (no-LLM) chat fallback when the LLM budget is exhausted. */
export function chatDeterministicFallbackEnabled() {
  return process.env.CHAT_DETERMINISTIC_FALLBACK !== '0';
}

/** Model-suggested follow-up questions after each answer (CHAT_FOLLOWUP_SUGGESTIONS=0 to disable). */
export function chatFollowupSuggestionsEnabled() {
  return process.env.CHAT_FOLLOWUP_SUGGESTIONS !== '0';
}

/** Rolling summarization of older turns instead of hard history truncation (CHAT_HISTORY_SUMMARY=0 to disable). */
export function chatHistorySummaryEnabled() {
  return process.env.CHAT_HISTORY_SUMMARY !== '0';
}

export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

export const PROPOSE_TOOL_NAMES = new Set([
  'propose_geo_unknown_update',
  'propose_operator_recommendation',
  'propose_signal_flag',
]);

export const OPERATOR_PROPOSE_TOOL_NAMES = new Set([
  'propose_operator_recommendation',
  'propose_signal_flag',
]);

/** Valid propose_signal_flag reasons (schema enum, propose gate, and executor). */
export const SIGNAL_FLAG_REASONS = new Set([
  'wrong_type', 'wrong_polarity', 'wrong_municipality',
  'not_a_signal', 'duplicate', 'noteworthy', 'other',
]);
