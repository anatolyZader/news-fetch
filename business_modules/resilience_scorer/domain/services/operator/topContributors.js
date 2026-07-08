/**
 * Rank per-component top_contributors for assessment display.
 */
import { getComponentWeight, hasStrongComponentLink } from '../signals/signalRouter.js';

/**
 * @param {object} signal
 * @param {string} componentId
 */
function contributorRankKey(signal, componentId) {
  const raw = Math.abs(signal._contribution);
  const signalType = signal.signal_type ?? signal.type;
  const weight = getComponentWeight(signalType, componentId);
  if (weight == null) return raw;
  return raw * Math.max(Math.abs(weight), 0.5);
}

/**
 * @param {object} signal
 * @param {string} componentId
 */
function hasStrongCatalogLink(signal, componentId) {
  const signalType = signal.signal_type ?? signal.type;
  return hasStrongComponentLink(signalType, componentId);
}

/**
 * @param {object} scored component score result with signals[]
 * @param {string} componentId
 * @returns {object[]}
 */
export function topContributorsFromScored(scored, componentId) {
  const pool = (scored.signals ?? []).filter((s) => typeof s._contribution === 'number');
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
    evidence: s.evidence ?? null,
    _contribution: s._contribution,
    _contribution_pre_cap: s._contribution_pre_cap ?? null,
    _contribution_raw: s._contribution_raw ?? null,
    _cap_scale_factor: s._cap_scale_factor ?? null,
    _cap_layer: s._cap_layer ?? null,
    _weight: s._weight,
    _polarity: s._polarity,
  }));
}
