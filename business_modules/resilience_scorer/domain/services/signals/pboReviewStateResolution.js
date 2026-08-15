/**
 * Re-resolve PBO municipal review state at assess time.
 *
 * Pipeline position: assess — after bundles are merged, before dedup.
 *
 * Why this exists: `pbo_review_state` is stamped onto signals at EXTRACT time
 * (pbo_report/domain/services/pboSignalReviewState.js), and the review store is
 * sparse, so every municipality without a row that moment defaults to
 * `unreviewed`. Reviews are written by the review workflow AFTER extraction, so
 * on a same-day run the value freezes as `unreviewed` and stays that way
 * forever unless the bundle is re-extracted. Downstream that made
 * `review_completeness.incomplete_share` permanently 0, which in turn meant the
 * THIN_REVIEW_SHARE confidence downgrade in evidencePipelinePrep.js could never
 * fire at all.
 *
 * Owns: overlaying live review state onto already-extracted signals.
 * Does NOT: read the review store (that is a port, wired at the composition
 * root — resilience_scorer must not import pbo_report_review), and does not
 * decide what a state means for confidence.
 *
 * Key collaborators: app/assessment/createPboReviewStatePort.js,
 * domain/contracts/componentEvidence.js (derivePboReviewCompleteness).
 */

/** Source types carrying municipal PBO returns. */
export const PBO_SOURCE_TYPES = new Set(['pbo', 'pbo_regional']);

/**
 * Municipality a PBO signal belongs to.
 *
 * Deliberately re-implements the `pbo-<name>` convention rather than importing
 * `pbo_report`'s `municipalityOfPboSignal` — cross-module imports are not
 * allowed and this is a naming convention, not shared behaviour. Keep the two
 * in step if the extract-unit builder ever changes its prefix.
 *
 * @param {{municipality?: string, article_source?: string}} signal
 * @returns {string|null}
 */
export function pboMunicipalityOf(signal) {
  if (signal?.municipality) return String(signal.municipality);
  const source = String(signal?.article_source ?? '');
  return source.startsWith('pbo-') ? source.slice('pbo-'.length) : null;
}

/** @param {object} signal */
export function isPboSignal(signal) {
  return PBO_SOURCE_TYPES.has(signal?.source_type) || pboMunicipalityOf(signal) != null;
}

/** Dates whose review rows are needed to resolve this signal set. */
export function pboDatesInSignals(signals) {
  const dates = new Set();
  for (const s of signals ?? []) {
    if (!isPboSignal(s)) continue;
    const date = s.signal_file_date ?? s.article_date;
    if (date) dates.add(String(date));
  }
  return [...dates];
}

/**
 * Overlay live review state onto PBO signals.
 *
 * Fail-open in both directions: a signal the store says nothing about keeps its
 * extract-time stamp, and a non-PBO signal is returned untouched.
 *
 * @param {Array<object>} signals
 * @param {Map<string, string>} stateByKey `${date}|${municipality}` → review state
 * @returns {{ signals: Array<object>, changed: number, resolved: number }}
 */
export function resolvePboReviewStates(signals, stateByKey) {
  if (!(stateByKey instanceof Map) || stateByKey.size === 0) {
    return { signals: signals ?? [], changed: 0, resolved: 0 };
  }
  let changed = 0;
  let resolved = 0;
  const out = (signals ?? []).map((s) => {
    if (!isPboSignal(s)) return s;
    const municipality = pboMunicipalityOf(s);
    const date = s.signal_file_date ?? s.article_date;
    if (!municipality || !date) return s;
    const live = stateByKey.get(`${date}|${municipality}`);
    if (!live) return s;
    resolved += 1;
    if (live === s.pbo_review_state) return s;
    changed += 1;
    return { ...s, municipality, pbo_review_state: live };
  });
  return { signals: out, changed, resolved };
}
