/**
 * Agent runtime configuration from environment.
 */
import { envFlagOn, envFlagOff } from '../config/envFlags.js';
import { HAIKU_MODEL } from '../llm/modelIds.js';

let _deprecatedAgentFlagLogged = false;

export function assessmentAgentEnabled() {
  return process.env.RESILIENCE_ASSESSMENT_AGENT !== '0';
}

/** @deprecated RESILIENCE_ASSESSMENT_AGENT=0 — use RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC=1 */
export function logDeprecatedAssessmentAgentFlag() {
  if (process.env.RESILIENCE_ASSESSMENT_AGENT !== '0') return;
  if (_deprecatedAgentFlagLogged) return;
  _deprecatedAgentFlagLogged = true;
  console.error(
    '[DEPRECATED] RESILIENCE_ASSESSMENT_AGENT=0 — legacy narratives removed; using deterministic degrade. ' +
    'Migrate to RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC=1.',
  );
}

export function assessmentForceDeterministic() {
  logDeprecatedAssessmentAgentFlag();
  if (process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC === '1'
    || process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC === 'true') {
    return true;
  }
  return process.env.RESILIENCE_ASSESSMENT_AGENT === '0';
}

export function isOmissionAuditModeEnabled(env = process.env) {
  const v = env.RESILIENCE_OMISSION_AUDIT;
  if (v == null || v === '') return true;
  if (envFlagOff(env, 'RESILIENCE_OMISSION_AUDIT')) return false;
  return envFlagOn(env, 'RESILIENCE_OMISSION_AUDIT');
}

export function isAssessmentAgentLegacyEnabled(env = process.env) {
  return envFlagOn(env, 'RESILIENCE_ASSESSMENT_AGENT_LEGACY');
}

export function isClosedCoreAssessEnabled(env = process.env) {
  if (isAssessmentAgentLegacyEnabled(env)) return false;
  const v = env.RESILIENCE_CLOSED_CORE_ASSESS;
  if (v == null || v === '') return true;
  if (envFlagOff(env, 'RESILIENCE_CLOSED_CORE_ASSESS')) return false;
  return envFlagOn(env, 'RESILIENCE_CLOSED_CORE_ASSESS');
}

export function shouldSkipAssessmentAgent({ dailyBudgetExceeded = false } = {}) {
  if (dailyBudgetExceeded) return true;
  if (isClosedCoreAssessEnabled()) return true;
  return assessmentForceDeterministic();
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
  const n = Number.parseInt(process.env.CHAT_MAX_TOOL_ROUNDS ?? '6', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 12) : 6;
}

export function chatTemporalMaxToolRounds() {
  const n = Number.parseInt(process.env.CHAT_TEMPORAL_MAX_TOOL_ROUNDS ?? '8', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 12) : 8;
}

/** Chat LLM model — Haiku by default for cost; set CHAT_MODEL to opt into a stronger model. */
export function chatModel() {
  const v = String(process.env.CHAT_MODEL ?? '').trim();
  return v || HAIKU_MODEL;
}

export function chatSessionMaxUsd() {
  // Intended to be lower than the default per-run governor cap ($2.50).
  const n = Number.parseFloat(process.env.CHAT_SESSION_MAX_USD ?? '2');
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 2;
}

export function validationAgentMaxRounds() {
  const n = Number.parseInt(process.env.VALIDATION_AGENT_MAX_TOOL_ROUNDS ?? '3', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10) : 3;
}

function envFlagEnabled(name) {
  const v = process.env[name];
  return v == null || v === '' || v === '1' || v === 'true';
}

export function deterministicPlannerEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_DETERMINISTIC_PLANNER');
}

export function slimPromptsEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_SLIM_PROMPTS');
}

export function slimPlannerPromptsEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_SLIM_PLANNER');
}

export function slimSynthPromptsEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_SLIM_SYNTH');
}

export function compressToolsEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_COMPRESS_TOOLS');
}

export function compactToolLoopEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_COMPACT_TOOL_LOOP');
}

export function chatCompactToolLoopEnabled() {
  const v = process.env.CHAT_COMPACT_TOOL_LOOP;
  return v !== '0' && v !== 'false';
}

export function tieredSpecialistsEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_TIERED_SPECIALISTS');
}

export function conditionalSynthEnabled() {
  const v = process.env.RESILIENCE_ASSESS_CONDITIONAL_SYNTH;
  return v === '1' || v === 'true';
}

export function forceDeterministicSynthEnabled() {
  return process.env.RESILIENCE_ASSESS_FORCE_DETERMINISTIC_SYNTH === '1'
    || process.env.RESILIENCE_ASSESS_FORCE_DETERMINISTIC_SYNTH === 'true';
}

export function synthesisGapThreshold() {
  const n = Number.parseInt(process.env.RESILIENCE_ASSESS_SYNTH_GAP_THRESHOLD ?? '3', 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

export function splitInvestigationMassEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS');
}

export function archiveEpistemicEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_ARCHIVE_EPISTEMIC');
}

export function residualForAgentEnabled() {
  if (isOmissionAuditModeEnabled()) return false;
  return envFlagEnabled('RESILIENCE_ASSESS_RESIDUAL_FOR_AGENT');
}

export function openObsForAgentEnabled() {
  if (isOmissionAuditModeEnabled()) return false;
  return envFlagOn(process.env, 'RESILIENCE_OPEN_OBS_FOR_AGENT');
}

export function investigationOovEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_INVESTIGATION_OOV');
}

export function replanHopEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_REPLAN_HOP');
}

export function crossComponentCheckEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_CROSS_COMPONENT_CHECK');
}

export function contestedAdversarialEnabled() {
  return envFlagEnabled('RESILIENCE_ASSESS_CONTESTED_ADVERSARIAL');
}

export { HAIKU_MODEL, SONNET_MODEL } from '../llm/modelIds.js';

export const PROMPT_VERSION = 'assessment-v1.2';
export const MODEL_CARD_REF = 'MODEL-CARD.md#assessment-agent';
