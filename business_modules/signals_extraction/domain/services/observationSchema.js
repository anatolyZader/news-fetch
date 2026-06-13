/**
 * Observation bundle validation and normalization.
 */

export const OBSERVATION_PROFILES = Object.freeze([
  'exploratory',
  'document_pack',
  'residual',
  'pipeline',
]);

const POLARITY = new Set(['positive', 'negative', 'mixed', 'unknown']);
const CONFIDENCE = new Set(['low', 'medium', 'high']);

/**
 * @param {unknown} profile
 */
export function isValidProfile(profile) {
  return typeof profile === 'string' && OBSERVATION_PROFILES.includes(profile);
}

/**
 * @param {unknown} obs
 * @param {number} index
 * @returns {object|null}
 */
export function normalizeObservation(obs, index) {
  if (!obs || typeof obs !== 'object') return null;
  const evidence = String(obs.evidence ?? '').trim();
  if (!evidence) return null;

  const behavioral = String(obs.behavioral_description ?? obs.description ?? '').trim()
    || evidence.slice(0, 120);

  const polarity = POLARITY.has(obs.polarity) ? obs.polarity : 'unknown';
  const confidence = CONFIDENCE.has(obs.confidence) ? obs.confidence : 'medium';

  const suggested = Array.isArray(obs.suggested_catalog_types)
    ? obs.suggested_catalog_types.filter((t) => typeof t === 'string').slice(0, 5)
    : [];

  const nearest = Array.isArray(obs.nearest_existing_types)
    ? obs.nearest_existing_types.filter((t) => typeof t === 'string').slice(0, 5)
    : [];

  const entities = Array.isArray(obs.entities)
    ? obs.entities.filter((e) => typeof e === 'string').slice(0, 20)
    : [];

  const tags = Array.isArray(obs.tags)
    ? obs.tags.filter((t) => typeof t === 'string').slice(0, 10)
    : [];

  const articleIndex = Number(obs.article_index);
  const idx = Number.isInteger(articleIndex) && articleIndex >= 1 ? articleIndex : index + 1;

  return {
    observation_id: String(obs.observation_id ?? `obs-${idx}`),
    article_index: idx,
    behavioral_description: behavioral,
    evidence,
    polarity,
    confidence,
    entities,
    suggested_catalog_types: suggested.length ? suggested : nearest,
    nearest_existing_types: nearest,
    novelty_hint: obs.novelty_hint ?? null,
    tags,
    article_url: obs.article_url ?? null,
    article_source: obs.article_source ?? null,
  };
}

/**
 * @param {Array<object>} raw
 * @returns {Array<object>}
 */
export function normalizeObservations(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const n = normalizeObservation(raw[i], i);
    if (n) out.push(n);
  }
  return out;
}

/**
 * @param {object} bundle
 * @returns {{ valid: boolean, errors: string[], bundle: object }}
 */
export function validateObservationBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, errors: ['bundle must be an object'], bundle: {} };
  }
  if (!isValidProfile(bundle.profile)) {
    errors.push(`profile must be one of: ${OBSERVATION_PROFILES.join(', ')}`);
  }
  if (!bundle.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(bundle.date))) {
    errors.push('date must be YYYY-MM-DD');
  }
  const observations = normalizeObservations(bundle.observations ?? []);
  if (!observations.length && !errors.length) {
    errors.push('observations array is empty');
  }

  const normalized = {
    profile: bundle.profile ?? 'exploratory',
    content_kind: bundle.content_kind ?? 'mixed',
    source_type: bundle.source_type ?? 'adhoc',
    date: bundle.date,
    extracted_at: bundle.extracted_at ?? new Date().toISOString(),
    source_files: Array.isArray(bundle.source_files) ? bundle.source_files : [],
    total_articles: bundle.total_articles ?? 0,
    observations,
  };

  return {
    valid: errors.length === 0 && observations.length > 0,
    errors,
    bundle: normalized,
  };
}

/**
 * @param {string} profile
 * @param {string} date
 */
export function observationBundleFilename(profile, date) {
  const safe = String(profile ?? 'exploratory').replaceAll(/[^a-z0-9_-]/gi, '_');
  return `observations-${safe}-${date}.json`;
}

/**
 * Daily pipeline open extract artifact (one per source type per date).
 * @param {string} sourceType
 * @param {string} date YYYY-MM-DD
 */
export function pipelineObservationBundleFilename(sourceType, date) {
  const safe = String(sourceType ?? 'adhoc').replaceAll(/[^a-z0-9_-]/gi, '_');
  return `observations-pipeline-${safe}-${date}.json`;
}

export function isPipelineObservationFilename(filename) {
  return /^observations-pipeline-.+-\d{4}-\d{2}-\d{2}\.json$/.test(String(filename ?? ''));
}
