/**
 * Map open observations to closed-vocabulary signals for assess (rule-based v1).
 *
 * Pipeline position: open → closed bridge on the assess path. Takes open
 * observations (suggested_catalog_types / nearest_existing_types) and emits
 * closed signal instances consumable by routing / componentEvidence.
 *
 * Owns: resolveCatalogTypeForObservation, mapObservation(s)ToSignal(s),
 * confidence → extraction_confidence mapping.
 * Does NOT: run LLM mapping, invent catalog types, or verify grounding
 * (openEvidenceVerification.js owns verification).
 *
 * Key collaborators: signalRouter.js (SIGNAL_TYPES), open observation loaders,
 * openEvidenceScoringSignals / assess CLIs.
 */
import { SIGNAL_TYPES } from './signalRouter.js';

/** Closed catalog type ids allowed as mapping targets. */
const VALID_TYPES = new Set(SIGNAL_TYPES);

/** Open observation confidence band → closed extraction_confidence float. */
const CONFIDENCE_TO_EXTRACTION = Object.freeze({
  low: 0.55,
  medium: 0.75,
  high: 0.9,
});

/**
 * Pick the first suggested or nearest type that exists in SIGNAL_TYPES.
 * @param {object} observation open observation row
 * @returns {string|null} catalog type id, or null if nothing maps
 */
export function resolveCatalogTypeForObservation(observation) {
  const suggested = observation?.suggested_catalog_types ?? [];
  for (const t of suggested) {
    if (typeof t === 'string' && VALID_TYPES.has(t)) return t;
  }
  const nearest = observation?.nearest_existing_types ?? [];
  for (const t of nearest) {
    if (typeof t === 'string' && VALID_TYPES.has(t)) return t;
  }
  return null;
}

/**
 * Map one open observation to a closed signal instance, or skip if unmappable.
 * mappingMethod is 'rule' when suggested_catalog_types[0] is valid, else 'residual_hint'.
 * @param {object} observation
 * @param {{ sourceType?: string, fileDate?: string, bundleProfile?: string }} ctx
 * @returns {{ signal: object|null, skipped: boolean, mappingMethod: string|null }}
 */
export function mapObservationToSignal(observation, ctx = {}) {
  const signalType = resolveCatalogTypeForObservation(observation);
  if (!signalType) {
    return { signal: null, skipped: true, mappingMethod: null };
  }

  const suggested = observation.suggested_catalog_types?.[0];
  const mappingMethod = suggested && VALID_TYPES.has(suggested)
    ? 'rule'
    : 'residual_hint';

  const conf = CONFIDENCE_TO_EXTRACTION[observation.confidence] ?? 0.75;

  const signal = {
    signal_type: signalType,
    evidence: observation.evidence,
    evidence_quote: observation.evidence,
    evidence_type: 'observational_reported_fact',
    evidence_basis: 'present_in_text',
    scope_level: observation.confidence === 'high' ? 'repeated_pattern' : 'single_case',
    extraction_confidence: conf,
    article_index: observation.article_index ?? 1,
    article_url: observation.article_url ?? null,
    article_source: observation.article_source ?? null,
    source_type: ctx.sourceType ?? 'adhoc',
    mapping_method: mappingMethod,
    observation_id: observation.observation_id ?? null,
    behavioral_description: observation.behavioral_description ?? null,
  };

  if (ctx.fileDate) {
    signal._observation_bundle_date = ctx.fileDate;
  }
  if (ctx.bundleProfile) {
    signal._observation_profile = ctx.bundleProfile;
  }

  return { signal, skipped: false, mappingMethod };
}

/**
 * Batch map open observations → closed signals with mapped/skipped counts.
 * @param {Array<object>} observations
 * @param {{ sourceType?: string, fileDate?: string, bundleProfile?: string }} ctx
 * @returns {{ signals: Array<object>, mapped: number, skipped: number }}
 */
export function mapObservationsToSignals(observations, ctx = {}) {
  const signals = [];
  let mapped = 0;
  let skipped = 0;

  for (const obs of observations ?? []) {
    const { signal, skipped: skip } = mapObservationToSignal(obs, ctx);
    if (skip || !signal) {
      skipped += 1;
      continue;
    }
    signals.push(signal);
    mapped += 1;
  }

  return { signals, mapped, skipped };
}
