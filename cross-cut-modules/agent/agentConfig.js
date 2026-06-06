/**
 * Agent runtime configuration from environment.
 */

export function assessmentAgentEnabled() {
  return process.env.RESILIENCE_ASSESSMENT_AGENT !== '0';
}

export function shadowScoringEnabled() {
  return process.env.RESILIENCE_SHADOW_SCORING !== '0';
}

export function shadowNarrativesEnabled() {
  return process.env.RESILIENCE_SHADOW_NARRATIVES === '1';
}

export function assessmentAgentMaxUsd() {
  const n = Number.parseFloat(process.env.RESILIENCE_ASSESSMENT_AGENT_MAX_USD ?? '2.50');
  return Number.isFinite(n) && n > 0 ? n : 2.5;
}

export function assessmentAgentMaxRounds() {
  const n = Number.parseInt(process.env.RESILIENCE_ASSESSMENT_AGENT_MAX_ROUNDS ?? '24', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 50) : 24;
}

export function chatMaxToolRounds() {
  const n = Number.parseInt(process.env.CHAT_MAX_TOOL_ROUNDS ?? '3', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10) : 3;
}

export function validationAgentMaxRounds() {
  const n = Number.parseInt(process.env.VALIDATION_AGENT_MAX_TOOL_ROUNDS ?? '3', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10) : 3;
}

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
export const SONNET_MODEL = 'claude-sonnet-4-6';

export const PROMPT_VERSION = 'assessment-v1.0';
export const MODEL_CARD_REF = 'MODEL-CARD.md#assessment-agent';
