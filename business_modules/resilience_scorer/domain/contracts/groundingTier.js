/**
 * Evidence-verification grounding tier labels (closed vocabulary).
 *
 * Pipeline position: assess path — attached to verified signal instances after
 * grounding checks; consumed by componentEvidence salience and report display.
 * Client-safe isomorphic.
 *
 * Owns: GROUNDING_TIER enum for probabilistic verification confidence.
 * Does NOT: narrativeGrounding QA, comp.grounding_score (specialist_agents),
 * or numeric resilience scores (min-math).
 *
 * Key collaborators: groundingPolicy.js, componentEvidence.js,
 * openEvidenceVerification.js, signal instance schema.
 */

/** Evidence-verification confidence tiers for grounded signal instances. */
export const GROUNDING_TIER = Object.freeze({
  grounded: 'grounded',
  weak: 'weak',
  unverified_critical: 'unverified_critical',
  rejected: 'rejected',
});
