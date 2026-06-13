/**
 * Feature flags for parallel open-vocabulary extraction and agent feeding.
 * "Parallel" = closed catalogue + open pipeline run concurrently on extract-signals (not sequential).
 */
import { isOpenPipelineExtractEnabled } from '../../../signals_extraction/index.js';

export { isOpenPipelineExtractEnabled };

export function isOpenExtractParallelEnabled(env = process.env) {
  return isOpenPipelineExtractEnabled(env);
}

export function isOpenObsForAgentEnabled(env = process.env) {
  const v = env.RESILIENCE_OPEN_OBS_FOR_AGENT;
  if (v == null || v === '') return true;
  return v === '1' || v === 'true' || v === 'on';
}

export function openObsGraphCap(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_OPEN_OBS_GRAPH_CAP ?? '20', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
}

export function openObsRoutingMode(env = process.env) {
  const m = String(env.RESILIENCE_OPEN_OBS_ROUTING ?? 'llm').toLowerCase();
  return m === 'keyword' ? 'keyword' : 'llm';
}

export function isOpenEvidenceScoringEnabled(env = process.env) {
  const v = env.RESILIENCE_OPEN_EVIDENCE_SCORING;
  if (v == null || v === '') return true;
  return v === '1' || v === 'true' || v === 'on';
}

export function openEvidenceScoreWeight(env = process.env) {
  const w = Number.parseFloat(env.RESILIENCE_OPEN_EVIDENCE_SCORE_WEIGHT ?? '0.4');
  return Number.isFinite(w) && w > 0 && w <= 1 ? w : 0.4;
}

export function isCatalogAutoProposeVerifiedEnabled(env = process.env) {
  const v = env.RESILIENCE_CATALOG_AUTO_PROPOSE_VERIFIED;
  return v === '1' || v === 'true' || v === 'on';
}
