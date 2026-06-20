/**
 * Env toggles for narrative grounding stack.
 */

export function isNarrativeGroundingEnabled() {
  return String(process.env.RESILIENCE_NARRATIVE_GROUNDING ?? '1').trim() !== '0';
}

export function isNarrativeFactsPassEnabled() {
  if (!isNarrativeGroundingEnabled()) return false;
  return String(process.env.RESILIENCE_NARRATIVE_FACTS_PASS ?? '1').trim() !== '0';
}

export function isNarrativeJudgeEnabled() {
  if (!isNarrativeGroundingEnabled()) return false;
  return String(process.env.RESILIENCE_NARRATIVE_JUDGE ?? '1').trim() !== '0';
}

export function narrativeGroundingMinScore() {
  const v = Number(process.env.RESILIENCE_NARRATIVE_GROUNDING_MIN ?? 0.6);
  return Number.isFinite(v) ? v : 0.6;
}

export function narrativeSynthesisMaxUrls() {
  const v = Number(process.env.RESILIENCE_NARRATIVE_SYNTHESIS_MAX_URLS ?? 8);
  return Number.isFinite(v) ? v : 8;
}

export const EVIDENCE_OVERLAP_MIN = 0.7;

/** @returns {'hybrid' | 'agent' | 'legacy'} */
export function resolveNarrativePipelineMode() {
  const v = String(process.env.RESILIENCE_NARRATIVE_PIPELINE ?? 'hybrid').trim().toLowerCase();
  if (v === 'agent' || v === 'legacy') return v;
  return 'hybrid';
}

export function hybridNarrativeEnabled() {
  return resolveNarrativePipelineMode() === 'hybrid';
}

export function legacyNarrativeOnly() {
  return resolveNarrativePipelineMode() === 'legacy';
}

export function operatorNarrativePipelineEnabled() {
  return hybridNarrativeEnabled() || legacyNarrativeOnly();
}
