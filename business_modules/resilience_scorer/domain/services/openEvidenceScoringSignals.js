/**
 * Synthesize discounted scoring signals from verified open observations (Phase 2).
 */
import {
  isOpenEvidenceScoringEnabled,
  openEvidenceScoreWeight,
} from './openExtractConfig.js';

/**
 * @param {object|null|undefined} observation
 */
function signalTypeForObservation(observation) {
  const hints = observation?.suggested_catalog_types ?? observation?.nearest_existing_types ?? [];
  const first = hints.find((t) => typeof t === 'string' && t.trim());
  return first ?? 'novel_behavior_observed';
}

/**
 * @param {Array<object>} verifiedClaims — output of verifyOpenEvidenceClaims
 * @param {object[]} openObservations
 * @param {object} [opts]
 */
export function synthesizeOpenEvidenceScoringSignals(verifiedClaims, openObservations = [], opts = {}) {
  if (!isOpenEvidenceScoringEnabled(opts.env) || !verifiedClaims?.length) {
    return { signals: [], applied: null };
  }

  const obsById = new Map(openObservations.map((o) => [String(o.observation_id), o]));
  const weight = openEvidenceScoreWeight(opts.env);
  /** @type {Array<object>} */
  const signals = [];
  const scoredIds = [];

  for (const entry of verifiedClaims) {
    const obs = entry.observation ?? obsById.get(String(entry.observation_id));
    if (!obs) continue;

    const signalType = signalTypeForObservation(obs);
    const evidence = String(obs.evidence ?? obs.behavioral_description ?? '').slice(0, 280);
    signals.push({
      signal_type: signalType,
      source_type: obs.source_type ?? 'news',
      evidence_type: 'observational_reported_fact',
      evidence,
      intensity: 'moderate',
      scope: 'single_case',
      confidence: obs.confidence === 'high' ? 'high' : 'medium',
      article_index: obs.article_index ?? null,
      article_url: obs.article_url ?? null,
      metricsEligible: true,
      open_evidence_synthetic: true,
      open_observation_id: obs.observation_id,
      open_score_weight: weight,
      verification: {
        claim_id: entry.claim_id,
        corroboration_level: entry.corroboration_level,
        component_id: entry.component_id,
      },
    });
    scoredIds.push(obs.observation_id);
  }

  if (!signals.length) return { signals: [], applied: null };

  return {
    signals,
    applied: {
      verified_count: verifiedClaims.length,
      synthetic_signal_count: signals.length,
      observation_ids: scoredIds,
      score_weight: weight,
    },
  };
}
