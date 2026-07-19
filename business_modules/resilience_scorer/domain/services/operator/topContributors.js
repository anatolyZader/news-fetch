/**
 * Rank per-component top_contributors for assessment display.
 *
 * Count-based ranking (no contribution mass): strong catalog link first, then
 * verified grounding, then evidence reliability class, then severity.
 */
import { getComponentWeight, hasStrongComponentLink } from '../signals/signalRouter.js';
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

function contributorRankKey(signal, componentId) {
  const signalType = signal.signal_type ?? signal.type;
  const weight = Math.abs(getComponentWeight(signalType, componentId) ?? 0.5);
  const grounded = signal.grounding_tier === GROUNDING_TIER.grounded ? 1 : 0;
  const evidenceClass = EVIDENCE_CLASS_RANK[signal.evidence_type ?? signal.evidence_class] ?? 2;
  const intensity = INTENSITY_RANK[signal.intensity] ?? 1;
  return grounded * 100 + evidenceClass * 10 + intensity * 2 + weight;
}

function hasStrongCatalogLink(signal, componentId) {
  const signalType = signal.signal_type ?? signal.type;
  return hasStrongComponentLink(signalType, componentId);
}

/**
 * @param {object} scored evidence component with signals[]
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
