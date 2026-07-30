/**
 * Signal reference registry shared by narrative context building and grounding QA.
 *
 * Pipeline position: built from narrative digest/scored components before LLM
 * facts/polish; used for ref resolution and prompt formatting.
 *
 * Owns: buildRefKey, S-label registry, formatSignalWithRef prompt lines.
 * Does NOT: perform overlap grounding QA (see narrativeGrounding/sentenceGroundingChecker.js).
 *
 * Key collaborators: `narrative/buildFullSignalDigest.js`, `narrativeGrounding/index.js`,
 * `operator/evidenceFormatting.js`.
 */

// ── Ref keys ──────────────────────────────────────────────────────────────────

/**
 * Article-level dedupe key for digest ranking.
 *
 * @param {object} signal
 * @returns {string}
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
 * Stable signal ref key: `{signal_type}@{articleKey}`.
 *
 * @param {object} signal
 * @returns {string}
 */
export function buildRefKey(signal) {
  const type = signal?.signal_type ?? signal?.type ?? 'unknown';
  return `${type}@${signalArticleKey(signal)}`;
}

// ── Registry build ────────────────────────────────────────────────────────────

/**
 * Build ref/label registry from per-component scored digest.
 *
 * @param {Record<string, object>} scoredComponents
 * @returns {{ byRef: Map<string, object>, byLabel: Map<string, object>, byComponent: Record<string, object[]>, refCount: number }}
 */
export function buildSignalRefRegistry(scoredComponents) {
  /** @type {Map<string, object>} */
  const byRef = new Map();
  /** @type {Map<string, object>} */
  const byLabel = new Map();
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
      byLabel.set(label, entry);
      byComponent[componentId].push(entry);
    }
  }

  return { byRef, byLabel, byComponent, refCount: counter };
}

// ── Registry lookup ───────────────────────────────────────────────────────────

/**
 * Resolve registry entry by S-label (e.g. S16).
 *
 * @param {string} label
 * @param {{ byLabel?: Map<string, object> }} registry
 * @returns {object|null}
 */
export function resolveLabel(label, registry) {
  return registry?.byLabel?.get(label) ?? null;
}

/**
 * Resolve registry entry by ref key.
 *
 * @param {string} refKey
 * @param {{ byRef: Map<string, object> }} registry
 * @returns {object|null}
 */
export function resolveRef(refKey, registry) {
  return registry?.byRef?.get(refKey) ?? null;
}

// ── Prompt formatting ─────────────────────────────────────────────────────────

/**
 * Format one signal block for LLM prompt with ref label and attribution.
 *
 * @param {object} signal
 * @param {{ label: string, ref: string }} entry
 * @returns {string}
 */
export function formatSignalWithRef(signal, entry) {
  const type = signal?.signal_type ?? signal?.type ?? 'unknown';
  const evType = signal?.evidence_type ?? 'unknown';
  const attribution = evidenceAttributionLabel(evType);
  const fd = formatSignalDateLine(signal);
  const urlLine = signal.article_url ? `\n  URL: ${signal.article_url}` : '';
  const geoTags = geoAuditTagsForSignal(signal);
  return (
    `[${entry.label}] ref=${entry.ref} type=${type} ev:${evType} attribution:${attribution}\n` +
    `${fd}  Evidence: "${signal.evidence ?? ''}"${urlLine}${geoTags}`
  );
}

/** Visit-dated line with age for field visits (stamped at bundle load); bundle-date line otherwise. */
function formatSignalDateLine(signal) {
  if (signal?.signal_age_days != null && signal?.visit_date) {
    const age = signal.signal_age_days;
    let ageLabel = `${age} days before report`;
    if (age <= 0) ageLabel = 'report day';
    else if (age === 1) ageLabel = '1 day before report';
    return `  Field visit date: ${signal.visit_date} (${ageLabel})\n`;
  }
  return signal?.signal_file_date ? `  Source bundle date: ${signal.signal_file_date}\n` : '';
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
 * Human label for evidence_type in prompts and UI.
 *
 * @param {string|null|undefined} evidenceType
 * @returns {string}
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
