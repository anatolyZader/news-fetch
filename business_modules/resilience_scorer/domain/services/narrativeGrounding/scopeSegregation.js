/**
 * Scope segregation QA — keep out-of-scope evidence out of local findings.
 *
 * Pipeline position: assess — after the polish pass writes component prose,
 * before the user surface is finalized.
 *
 * Owns: the context-derived-claim test and the marker-sentence contract.
 * Does NOT: decide provenance (signals/evidenceEligibility.js owns that), score
 * sentence grounding (sentenceGroundingChecker.js), or rewrite prose.
 *
 * Why this exists: the polish prompt already required national and regional
 * context to be segregated into trailing sentences beginning with a fixed
 * marker, but the prompt never showed the model which refs carried that
 * provenance, so the rule was unfollowable. On north 2026-04-02 compliance was
 * 0 of 8 components and the executive summary asserted an early-warning failure
 * "that left Ashdod and Ashkelon residents without advance alert" — two
 * southern cities — as a northern finding. Surfacing provenance in the prompt
 * (signalRefRegistry.formatSignalWithRef) makes compliance possible; this
 * checks it, because a prompt rule with no check is how that report shipped.
 *
 * Key collaborators: narrative/signalRefRegistry.js, signals/evidenceEligibility.js,
 * app/assessment/userNarrativePipeline.js.
 */

import { resolveRef } from '../narrative/signalRefRegistry.js';
import { isContextOnlySignal } from '../signals/evidenceEligibility.js';

/**
 * Sentence openers that mark prose as describing somewhere other than the
 * report scope. Must stay in step with the polish prompt in
 * infrastructure/narrativePolish.js — the prompt dictates the exact wording and
 * this recognises it.
 */
export const SCOPE_MARKER_PATTERNS = Object.freeze([
  /National press \(not [a-z-]+-local evidence\):/i,
  /Regional press \(not [a-z-]+-local scored evidence\):/i,
]);

/**
 * Marker the deterministic fallback prepends to an out-of-scope claim. Matches
 * SCOPE_MARKER_PATTERNS, so fallback prose passes its own check.
 */
export const SCOPE_MARKER_PREFIX = 'National press (not scope-local evidence):';

/** Reason codes, surfaced in narrative_pipeline_degrade_reasons. */
export const SCOPE_VIOLATION = Object.freeze({
  missing_marker: 'scope_marker_missing',
  context_outside_marker: 'scope_context_outside_marker',
});

/** Kill-switch: set RESILIENCE_NARRATIVE_SCOPE_GATE=0 to disable the check. */
export function isScopeGateEnabled(env = process.env) {
  return env.RESILIENCE_NARRATIVE_SCOPE_GATE !== '0';
}

/**
 * Whether a claim rests ENTIRELY on out-of-scope evidence.
 *
 * Deliberately "every ref", not "any ref": a claim that combines local and
 * national evidence is a legitimate comparison and belongs in the body. Only a
 * claim with no local footing at all is a finding about somewhere else.
 *
 * @param {object} claim
 * @param {object} registry ref registry from buildSignalRefRegistry
 * @returns {boolean}
 */
export function isContextDerivedClaim(claim, registry) {
  const refs = claim?.signal_refs ?? [];
  if (refs.length === 0) return false;
  const resolved = refs.map((ref) => resolveRef(String(ref), registry)?.signal).filter(Boolean);
  if (resolved.length === 0) return false;
  return resolved.every((signal) => isContextOnlySignal(signal));
}

/** Split prose into sentences for marker attribution. Blunt but language-agnostic. */
function splitSentences(prose) {
  return String(prose ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whether a sentence opens with one of the scope markers. */
export function hasScopeMarker(sentence) {
  return SCOPE_MARKER_PATTERNS.some((re) => re.test(String(sentence ?? '')));
}

/**
 * Check one component's prose against its claims.
 *
 * @param {{ prose: string, claims: object[], registry: object }} input
 * @returns {{ ok: boolean, violations: string[], context_claim_count: number, marker_sentence_count: number }}
 */
export function checkComponentScopeSegregation({ prose, claims, registry }) {
  const contextClaims = (claims ?? []).filter((c) => isContextDerivedClaim(c, registry));
  const sentences = splitSentences(prose);
  const markerCount = sentences.filter(hasScopeMarker).length;
  const result = {
    ok: true,
    violations: [],
    context_claim_count: contextClaims.length,
    marker_sentence_count: markerCount,
  };

  if (contextClaims.length === 0) return result;

  // Prose carrying out-of-scope claims must say so somewhere.
  if (markerCount === 0 && String(prose ?? '').trim()) {
    result.ok = false;
    result.violations.push(SCOPE_VIOLATION.missing_marker);
    return result;
  }

  // A marker exists, but the out-of-scope material must live inside it. If the
  // marked sentences are outnumbered by context claims, at least one claim was
  // written into the local body — which is the failure mode observed.
  if (markerCount > 0 && markerCount < contextClaims.length) {
    result.ok = false;
    result.violations.push(SCOPE_VIOLATION.context_outside_marker);
  }
  return result;
}
