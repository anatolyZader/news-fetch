/**
 * Map open observations to closed-vocabulary signals for assess (rule-based v1).
 */
import { SIGNAL_TYPES } from './signalCatalog.js';

const VALID_TYPES = new Set(SIGNAL_TYPES);

const CONFIDENCE_TO_EXTRACTION = Object.freeze({
  low: 0.55,
  medium: 0.75,
  high: 0.9,
});

/**
 * @param {object} observation
 * @returns {string|null}
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
