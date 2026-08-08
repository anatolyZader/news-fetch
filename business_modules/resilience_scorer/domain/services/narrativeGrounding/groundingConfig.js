/**
 * Environment toggles for the narrative grounding stack (post-hoc prose QA).
 *
 * Pipeline position: read at narrative pipeline startup and grounding checks;
 * distinct from GROUNDING_TIER evidence verification on signals.
 *
 * Owns: feature flags, token caps, pipeline mode resolution, overlap threshold constant.
 * Does NOT: score sentences or validate LLM JSON (see sibling modules).
 *
 * Key collaborators: `sentenceGroundingChecker.js`, `narrativeSchemaValidator.js`,
 * app narrative orchestrator, `user/assessmentDisplayTier.js` (min score for interpretive_summary).
 */

import { envFlagOn } from '../../../../../cross-cut-modules/config/envFlags.js';

// ── Feature flags ─────────────────────────────────────────────────────────────

/**
 * Master toggle for narrative grounding pipeline (RESILIENCE_NARRATIVE_GROUNDING).
 *
 * @returns {boolean}
 */
export function isNarrativeGroundingEnabled() {
  return String(process.env.RESILIENCE_NARRATIVE_GROUNDING ?? '1').trim() !== '0';
}

/**
 * Whether the facts-pass LLM stage runs (requires grounding enabled).
 *
 * @returns {boolean}
 */
export function isNarrativeFactsPassEnabled() {
  if (!isNarrativeGroundingEnabled()) return false;
  return String(process.env.RESILIENCE_NARRATIVE_FACTS_PASS ?? '1').trim() !== '0';
}

/**
 * Whether the judge/repair LLM stage runs (requires grounding enabled).
 *
 * @returns {boolean}
 */
export function isNarrativeJudgeEnabled() {
  if (!isNarrativeGroundingEnabled()) return false;
  return String(process.env.RESILIENCE_NARRATIVE_JUDGE ?? '1').trim() !== '0';
}

/**
 * Whether low grounding scores block narrative publish (strict mode).
 *
 * @returns {boolean}
 */
export function isNarrativeGroundingBlockEnabled() {
  return envFlagOn(process.env, 'RESILIENCE_NARRATIVE_GROUNDING_BLOCK');
}

// ── Thresholds and caps ───────────────────────────────────────────────────────

/**
 * Minimum narrative_grounding_score before prose is treated as interpretive summary.
 *
 * @returns {number}
 */
export function narrativeGroundingMinScore() {
  const v = Number(process.env.RESILIENCE_NARRATIVE_GROUNDING_MIN ?? 0.6);
  return Number.isFinite(v) ? v : 0.6;
}

/**
 * Max distinct URLs allowed in cross_component_synthesis.
 *
 * @returns {number}
 */
export function narrativeSynthesisMaxUrls() {
  const v = Number(process.env.RESILIENCE_NARRATIVE_SYNTHESIS_MAX_URLS ?? 8);
  return Number.isFinite(v) ? v : 8;
}

/**
 * Token cap for facts-pass LLM calls.
 *
 * @returns {number}
 */
export function narrativeFactsMaxTokens() {
  const v = Number.parseInt(process.env.RESILIENCE_NARRATIVE_FACTS_MAX_TOKENS ?? '12000', 10);
  return Number.isFinite(v) && v > 0 ? v : 12000;
}

/**
 * Token cap for judge LLM call scaled by claim count.
 *
 * @param {number} [claimCount=1]
 * @returns {number}
 */
export function narrativeJudgeMaxTokens(claimCount = 1) {
  const cap = Number.parseInt(process.env.RESILIENCE_NARRATIVE_JUDGE_MAX_TOKENS ?? '8000', 10);
  const maxCap = Number.isFinite(cap) && cap > 0 ? cap : 8000;
  return Math.min(maxCap, 200 + Math.max(1, claimCount) * 120);
}

/** Minimum text/evidence overlap for grounding checks (0–1). */
export const EVIDENCE_OVERLAP_MIN = 0.7;

// ── Pipeline mode ─────────────────────────────────────────────────────────────

/**
 * Resolve narrative pipeline mode: hybrid, agent, or legacy.
 *
 * @returns {'hybrid' | 'agent' | 'legacy'}
 */
export function resolveNarrativePipelineMode() {
  const v = String(process.env.RESILIENCE_NARRATIVE_PIPELINE ?? 'hybrid').trim().toLowerCase();
  if (v === 'agent' || v === 'legacy') return v;
  return 'hybrid';
}

/**
 * @returns {boolean}
 */
export function hybridNarrativeEnabled() {
  return resolveNarrativePipelineMode() === 'hybrid';
}

/**
 * @returns {boolean}
 */
export function legacyNarrativeOnly() {
  return resolveNarrativePipelineMode() === 'legacy';
}

/**
 * Whether user narrative finalize pipeline should run (hybrid or legacy).
 *
 * @returns {boolean}
 */
export function userNarrativePipelineEnabled() {
  return hybridNarrativeEnabled() || legacyNarrativeOnly();
}
