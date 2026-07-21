/**
 * Feature flags for parallel open-vocabulary extraction and agent feeding.
 *
 * Pipeline position: STAGE-1 extract and STAGE-2 assess routing — gates closed vs
 * open paths, omission audit, and open-evidence scoring (oov family).
 *
 * Owns: env-driven flags for parallel open extract, closed-core assess, open obs
 * for agent, and open evidence scoring weights.
 * Does NOT: run extraction (see `open_observation_extraction/`) or verify open
 * evidence (see `signals/openEvidenceVerification.js`).
 *
 * Key collaborators: `open_observation_extraction/index.js`, assess finalize,
 * specialist agent orchestrator.
 *
 * "Parallel" = closed catalogue + open pipeline run concurrently on extract-signals
 * (not sequential).
 */

export { isOpenPipelineExtractEnabled } from '../../../../open_observation_extraction/index.js';
import { isOpenPipelineExtractEnabled } from '../../../../open_observation_extraction/index.js';
import { envFlagOn, envFlagOff } from '../../../../../cross-cut-modules/config/envFlags.js';

// ---------------------------------------------------------------------------
// STAGE-1 extraction vocabulary axis
// ---------------------------------------------------------------------------

/**
 * STAGE-1 extraction-vocabulary axis: when true, closed-catalogue and open-vocabulary
 * extractions run concurrently. Distinct from STAGE-2 assessment-path flags
 * (`isClosedCoreAssessEnabled`, `shouldSkipAssessmentAgent`, etc.).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isOpenExtractParallelEnabled(env = process.env) {
  return isOpenPipelineExtractEnabled(env);
}

/**
 * Re-enable full pipeline open extract + ingest backfill (rag-v legacy).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isOpenPipelineLegacyEnabled(env = process.env) {
  return envFlagOn(env, 'RESILIENCE_OPEN_PIPELINE_LEGACY');
}

// ---------------------------------------------------------------------------
// STAGE-2 assessment routing
// ---------------------------------------------------------------------------

/**
 * Closed-core interim: omission audit artifact, no open obs feed to assess/agent.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isOmissionAuditEnabled(env = process.env) {
  const v = env.RESILIENCE_OMISSION_AUDIT;
  if (v == null || v === '') return true;
  if (envFlagOff(env, 'RESILIENCE_OMISSION_AUDIT')) return false;
  return envFlagOn(env, 'RESILIENCE_OMISSION_AUDIT');
}

/**
 * Closed-core: score shell + hybrid narrative pipeline (digest + facts/polish);
 * no multi-agent specialists.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isClosedCoreAssessEnabled(env = process.env) {
  if (envFlagOn(env, 'RESILIENCE_ASSESSMENT_AGENT_LEGACY')) return false;
  const v = env.RESILIENCE_CLOSED_CORE_ASSESS;
  if (v == null || v === '') return true;
  if (envFlagOff(env, 'RESILIENCE_CLOSED_CORE_ASSESS')) return false;
  return envFlagOn(env, 'RESILIENCE_CLOSED_CORE_ASSESS');
}

/**
 * Feed verified open observations into the assessment agent graph.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isOpenObsForAgentEnabled(env = process.env) {
  if (isOmissionAuditEnabled(env)) return false;
  const v = env.RESILIENCE_OPEN_OBS_FOR_AGENT;
  if (v == null || v === '') return false;
  return envFlagOn(env, 'RESILIENCE_OPEN_OBS_FOR_AGENT');
}

/**
 * Cap on open observations attached to the agent graph.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function openObsGraphCap(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_OPEN_OBS_GRAPH_CAP ?? '20', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
}

/**
 * Open observation routing mode: `keyword` or `llm`.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'keyword' | 'llm'}
 */
export function openObsRoutingMode(env = process.env) {
  const m = String(env.RESILIENCE_OPEN_OBS_ROUTING ?? 'keyword').toLowerCase();
  return m === 'keyword' ? 'keyword' : 'llm';
}

// ---------------------------------------------------------------------------
// Open evidence scoring (opt-in; min-math weight discount only)
// ---------------------------------------------------------------------------

/**
 * Enable open-evidence synthetic signal path (production default OFF).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isOpenEvidenceScoringEnabled(env = process.env) {
  if (isOmissionAuditEnabled(env)) return false;
  const v = env.RESILIENCE_OPEN_EVIDENCE_SCORING;
  if (v == null || v === '') return false;
  return envFlagOn(env, 'RESILIENCE_OPEN_EVIDENCE_SCORING');
}

/**
 * Weight discount applied to open-evidence synthetic signals (0–1).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function openEvidenceScoreWeight(env = process.env) {
  const w = Number.parseFloat(env.RESILIENCE_OPEN_EVIDENCE_SCORE_WEIGHT ?? '0.4');
  return Number.isFinite(w) && w > 0 && w <= 1 ? w : 0.4;
}

/**
 * JSONL residuals into agent graph — off when omission audit mode is on.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isResidualForAgentEnabled(env = process.env) {
  if (isOmissionAuditEnabled(env)) return false;
  const v = env.RESILIENCE_ASSESS_RESIDUAL_FOR_AGENT;
  if (v == null || v === '') return true;
  return envFlagOn(env, 'RESILIENCE_ASSESS_RESIDUAL_FOR_AGENT');
}
