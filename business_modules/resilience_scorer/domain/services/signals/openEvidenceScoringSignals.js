/**
 * Synthesize discounted closed-catalogue signals from verified open observations (Phase 2).
 *
 * Pipeline position: assess — after openEvidenceVerification, before merged signal bundle scoring.
 *
 * Owns: synthetic signal construction from verified open claims with open_score_weight discount.
 * Does NOT: open claim verification (openEvidenceVerification.js), closed catalogue extraction, or routing weights.
 *
 * Key collaborators: openEvidenceVerification.js, ../oov/openExtractConfig.js, routing/catalogMappingService.js, evidenceEligibility.js, groundingPolicy.js.
 */
import {
  isOpenEvidenceScoringEnabled,
  openEvidenceScoreWeight,
} from '../oov/openExtractConfig.js';
import { resolveCatalogTypeForObservation } from './routing/catalogMappingService.js';

/**
 * Build synthetic closed-catalogue signals from verified open evidence claims.
 *
 * @param {Array<object>} verifiedClaims output of verifyOpenEvidenceClaims
 * @param {object[]} openObservations loaded open observation records
 * @param {object} [opts] env and config overrides
 * @returns {{ signals: object[], applied: object|null }} synthetic signals and summary metadata
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

    const signalType = resolveCatalogTypeForObservation(obs) ?? 'novel_behavior_observed';
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
