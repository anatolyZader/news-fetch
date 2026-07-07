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

export function narrativeFactsMaxTokens() {
  const v = Number.parseInt(process.env.RESILIENCE_NARRATIVE_FACTS_MAX_TOKENS ?? '12000', 10);
  return Number.isFinite(v) && v > 0 ? v : 12000;
}

export function narrativeJudgeMaxTokens(claimCount = 1) {
  const cap = Number.parseInt(process.env.RESILIENCE_NARRATIVE_JUDGE_MAX_TOKENS ?? '8000', 10);
  const maxCap = Number.isFinite(cap) && cap > 0 ? cap : 8000;
  return Math.min(maxCap, 200 + Math.max(1, claimCount) * 120);
}

export function isNarrativeGroundingBlockEnabled() {
  const v = process.env.RESILIENCE_NARRATIVE_GROUNDING_BLOCK;
  return v === '1' || v === 'true' || v === 'on';
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
