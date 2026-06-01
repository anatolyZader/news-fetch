/**
 * Chat agent feature flags.
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

export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

export const PROPOSE_TOOL_NAMES = new Set([
  'propose_validation_decision',
  'propose_geo_unknown_update',
  'propose_catalog_proposal_review',
  'propose_operator_recommendation',
]);

export const OPERATOR_PROPOSE_TOOL_NAMES = new Set([
  'propose_operator_recommendation',
]);
