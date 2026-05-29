import { formatSignalContributionSuffix } from './suppressionPromptContext.js';

/**
 * @param {object} signal
 */
export function signalArticleKey(signal) {
  if (signal?.article_url) return `url:${signal.article_url}`;
  if (signal?.article_index != null && signal?.source_file) {
    return `file:${signal.source_file}#${signal.article_index}`;
  }
  if (signal?.article_index != null) return `idx:${signal.article_index}`;
  if (signal?.source_type) return `src:${signal.source_type}`;
  return 'unknown';
}

/**
 * @param {object} signal
 */
export function buildRefKey(signal) {
  const type = signal?.signal_type ?? signal?.type ?? 'unknown';
  return `${type}@${signalArticleKey(signal)}`;
}

/**
 * @param {Record<string, object>} scoredComponents
 */
export function buildSignalRefRegistry(scoredComponents) {
  /** @type {Map<string, object>} */
  const byRef = new Map();
  /** @type {Record<string, Array<{ ref: string, label: string, signal: object }>>} */
  const byComponent = {};
  let counter = 0;

  for (const [componentId, scored] of Object.entries(scoredComponents ?? {})) {
    byComponent[componentId] = [];
    for (const signal of scored?.signals ?? []) {
      counter += 1;
      const ref = buildRefKey(signal);
      const label = `S${counter}`;
      const entry = { ref, label, signal, componentId };
      byRef.set(ref, entry);
      byComponent[componentId].push(entry);
    }
  }

  return { byRef, byComponent, refCount: counter };
}

/**
 * @param {string} refKey
 * @param {{ byRef: Map<string, object> }} registry
 */
export function resolveRef(refKey, registry) {
  return registry?.byRef?.get(refKey) ?? null;
}

/**
 * @param {object} signal
 * @param {{ label: string, ref: string }} entry
 */
export function formatSignalWithRef(signal, entry) {
  const type = signal?.signal_type ?? signal?.type ?? 'unknown';
  const evType = signal?.evidence_type ?? 'unknown';
  const attribution = evidenceAttributionLabel(evType);
  const fd = signal.signal_file_date ? `  Source bundle date: ${signal.signal_file_date}\n` : '';
  const urlLine = signal.article_url ? `\n  URL: ${signal.article_url}` : '';
  const geoTags = geoAuditTagsForSignal(signal);
  return (
    `[${entry.label}] ref=${entry.ref} type=${type} ev:${evType} attribution:${attribution}\n` +
    `${fd}  Evidence: "${signal.evidence ?? ''}"${urlLine}${geoTags}` +
    `${formatSignalContributionSuffix(signal)}`
  );
}

function geoAuditTagsForSignal(s) {
  const g = s?.geo;
  if (g?.kind !== 'resolved') return '';
  const prov = g.resolution?.provenance;
  const parts = [];
  if (prov) parts.push(`geo:provenance=${prov}`);
  if (s.metricsEligible === false) parts.push('metricsEligible=false');
  return parts.length ? `\n  Geo audit: ${parts.join(' ')}` : '';
}

/**
 * @param {string|null|undefined} evidenceType
 */
export function evidenceAttributionLabel(evidenceType) {
  switch (evidenceType) {
    case 'direct_quote_named_person':
      return 'Attributed quote';
    case 'named_survey_statistic':
      return 'Survey statistic';
    case 'named_institutional_fact':
      return 'Institutional fact';
    case 'observational_reported_fact':
      return 'Observed in reporting';
    default:
      return 'Reported observation';
  }
}

/**
 * @param {string|null|undefined} evidenceType
 */
export function epistemicFramingHint(evidenceType) {
  switch (evidenceType) {
    case 'direct_quote_named_person':
      return 'Frame as attributed quote ("A named person said…").';
    case 'named_institutional_fact':
      return 'Frame as institutional ("According to [source type]…").';
    case 'named_survey_statistic':
      return 'Frame as reported statistic with source.';
    default:
      return 'Frame as observed reporting ("Reporting describes…").';
  }
}
