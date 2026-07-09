/**
 * Feature flags for parallel open-vocabulary extraction and agent feeding.
 * "Parallel" = closed catalogue + open pipeline run concurrently on extract-signals (not sequential).
 */
export { isOpenPipelineExtractEnabled } from '../../../../open_observation_extraction/index.js';
import { isOpenPipelineExtractEnabled } from '../../../../open_observation_extraction/index.js';

function envFlagOn(env, name) {
  const v = env[name];
  return v === '1' || v === 'true' || v === 'on';
}

function envFlagOff(env, name) {
  const v = env[name];
  return v === '0' || v === 'false' || v === 'off';
}

/**
 * STAGE-1 extraction-vocabulary axis: when true, closed-catalogue and open-vocabulary
 * extractions run concurrently. Distinct from STAGE-2 assessment-path flags
 * (isClosedCoreAssessEnabled, shouldSkipAssessmentAgent, etc.).
 */
export function isOpenExtractParallelEnabled(env = process.env) {
  return isOpenPipelineExtractEnabled(env);
}

/** Re-enable full pipeline open extract + ingest backfill (rag-v legacy). */
export function isOpenPipelineLegacyEnabled(env = process.env) {
  return envFlagOn(env, 'RESILIENCE_OPEN_PIPELINE_LEGACY');
}

/** Closed-core interim: omission audit artifact, no open obs feed to assess/agent. */
export function isOmissionAuditEnabled(env = process.env) {
  const v = env.RESILIENCE_OMISSION_AUDIT;
  if (v == null || v === '') return true;
  if (envFlagOff(env, 'RESILIENCE_OMISSION_AUDIT')) return false;
  return envFlagOn(env, 'RESILIENCE_OMISSION_AUDIT');
}

/** Closed-core: score shell + hybrid narrative pipeline (digest + facts/polish); no multi-agent specialists. */
export function isClosedCoreAssessEnabled(env = process.env) {
  if (envFlagOn(env, 'RESILIENCE_ASSESSMENT_AGENT_LEGACY')) return false;
  const v = env.RESILIENCE_CLOSED_CORE_ASSESS;
  if (v == null || v === '') return true;
  if (envFlagOff(env, 'RESILIENCE_CLOSED_CORE_ASSESS')) return false;
  return envFlagOn(env, 'RESILIENCE_CLOSED_CORE_ASSESS');
}

export function isOpenObsForAgentEnabled(env = process.env) {
  if (isOmissionAuditEnabled(env)) return false;
  const v = env.RESILIENCE_OPEN_OBS_FOR_AGENT;
  if (v == null || v === '') return false;
  return envFlagOn(env, 'RESILIENCE_OPEN_OBS_FOR_AGENT');
}

export function openObsGraphCap(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_OPEN_OBS_GRAPH_CAP ?? '20', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
}

export function openObsRoutingMode(env = process.env) {
  const m = String(env.RESILIENCE_OPEN_OBS_ROUTING ?? 'keyword').toLowerCase();
  return m === 'keyword' ? 'keyword' : 'llm';
}

// Production default: OFF — enable only after audit (set RESILIENCE_OPEN_EVIDENCE_SCORING=1 or on).
export function isOpenEvidenceScoringEnabled(env = process.env) {
  if (isOmissionAuditEnabled(env)) return false;
  const v = env.RESILIENCE_OPEN_EVIDENCE_SCORING;
  if (v == null || v === '') return false;
  return envFlagOn(env, 'RESILIENCE_OPEN_EVIDENCE_SCORING');
}

export function openEvidenceScoreWeight(env = process.env) {
  const w = Number.parseFloat(env.RESILIENCE_OPEN_EVIDENCE_SCORE_WEIGHT ?? '0.4');
  return Number.isFinite(w) && w > 0 && w <= 1 ? w : 0.4;
}

export function isCatalogAutoProposeVerifiedEnabled(env = process.env) {
  return envFlagOn(env, 'RESILIENCE_CATALOG_AUTO_PROPOSE_VERIFIED');
}

/** JSONL residuals into agent graph — off when omission audit mode is on. */
export function isResidualForAgentEnabled(env = process.env) {
  if (isOmissionAuditEnabled(env)) return false;
  const v = env.RESILIENCE_ASSESS_RESIDUAL_FOR_AGENT;
  if (v == null || v === '') return true;
  return envFlagOn(env, 'RESILIENCE_ASSESS_RESIDUAL_FOR_AGENT');
}
