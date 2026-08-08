/**
 * Count-based ranking of per-component top_contributors for assessment display.
 *
 * Pipeline position: evidence pipeline / narrative digest — ranks signals for
 * user evidence lists and digest caps.
 *
 * Owns: contributorRankKey sort key (primary edge, GROUNDING_TIER, evidence class).
 * Does NOT: compute numeric contribution mass or resilience scores.
 *
 * Key collaborators: `signals/routing/signalRouter.js`, `signals/groundingPolicy.js`,
 * `narrative/buildFullSignalDigest.js`, user narrative surface.
 */

import { isPrimaryEdge } from '../signals/routing/signalRouter.js';
import { GROUNDING_TIER } from '../signals/groundingPolicy.js';

const EVIDENCE_CLASS_RANK = {
  direct_quote_named_person: 4,
  named_survey_statistic: 4,
  named_institutional_fact: 3,
  direct_evidence: 3,
  observational_reported_fact: 2,
  observational_evidence: 2,
};

const INTENSITY_RANK = { severe: 2, moderate: 1, light: 0 };

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * Composite sort key for count-based contributor ranking (higher = more salient).
 *
 * Temporal term spans ~0.15–3 (temporal_weight × 3): a fresh signal outranks an
 * equally-graded stale one and can outrank an intensity step (2) + primary edge (1),
 * but never an evidence-class step (10), grounding (100), or a severe→light gap (4).
 *
 * @param {object} signal
 * @param {string} componentId
 * @returns {number}
 */
export function contributorRankKey(signal, componentId) {
  const signalType = signal.signal_type ?? signal.type;
  const primaryEdge = isPrimaryEdge(signalType, componentId) ? 1 : 0;
  const grounded = signal.grounding_tier === GROUNDING_TIER.grounded ? 1 : 0;
  const evidenceClass = EVIDENCE_CLASS_RANK[signal.evidence_type ?? signal.evidence_class] ?? 2;
  const intensity = INTENSITY_RANK[signal.intensity] ?? 1;
  const temporal = (signal.temporal_weight ?? 1) * 3;
  return grounded * 100 + evidenceClass * 10 + intensity * 2 + primaryEdge + temporal;
}

function hasStrongCatalogLink(signal, componentId) {
  const signalType = signal.signal_type ?? signal.type;
  return isPrimaryEdge(signalType, componentId);
}

// ── Top contributors list ─────────────────────────────────────────────────────

/**
 * Build ranked top_contributors array for one component from scored signals.
 *
 * @param {object} scored Evidence component with signals[].
 * @param {string} componentId
 * @returns {object[]}
 */
export function topContributorsFromScored(scored, componentId) {
  const pool = scored?.signals ?? [];
  const strong = pool.filter((s) => hasStrongCatalogLink(s, componentId));
  const ranked = (strong.length >= 3 ? strong : pool)
    .slice()
    .sort((a, b) => contributorRankKey(b, componentId) - contributorRankKey(a, componentId))
    .slice(0, 10);

  return ranked.map((s) => ({
    signal_type: s.signal_type ?? s.type ?? null,
    source_type: s.source_type ?? null,
    article_source: s.article_source ?? null,
    article_url: s.article_url ?? null,
    evidence: s.evidence ?? s.evidence_snippet ?? null,
    grounding_tier: s.grounding_tier ?? null,
    intensity: s.intensity ?? null,
    _polarity: s._polarity ?? s.polarity ?? null,
  }));
}
