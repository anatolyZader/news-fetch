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

export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

export const PROPOSE_TOOL_NAMES = new Set([
  'propose_geo_unknown_update',
  'propose_operator_recommendation',
]);

export const OPERATOR_PROPOSE_TOOL_NAMES = new Set([
  'propose_operator_recommendation',
]);
