/**
 * Stamp municipal review state onto extracted PBO signals.
 *
 * Pipeline position: extract — post-LLM, alongside source-id stamping.
 *
 * Owns: the dense municipality → review-state map (the review store is sparse,
 * so the `unreviewed` default is applied here, where the roster is known), and
 * the `pbo_review_state` / `municipality` fields on emitted signals.
 * Does NOT: decide what a review state means for scoring (componentEvidence.js
 * aggregates it; evidencePipelinePrep.js consumes it).
 *
 * Key collaborators: pbo_report_review/domain/services/reviewSupplementalTexts.js,
 * input/extract-pbo-signals.js.
 */
import { PBO_REVIEW_STATE } from '../../../pbo_report_review/index.js';

/**
 * Dense municipality → review state for one dashboard day.
 *
 * `reviewMetaByMuni` only holds municipalities that have a review row, so every
 * name on the day's roster that is missing from it is `unreviewed` — a coverage
 * gap, not a quality verdict.
 *
 * @param {{ municipalities?: Array<{name: string}> }} day dashboard day entry
 * @param {Map<string, {pbo_review_state?: string}>} [reviewMetaByMuni]
 * @returns {Map<string, string>} municipality name → PBO_REVIEW_STATE value
 */
export function buildPboReviewStateMap(day, reviewMetaByMuni = new Map()) {
  const out = new Map();
  for (const muni of day?.municipalities ?? []) {
    if (!muni?.name) continue;
    const meta = reviewMetaByMuni.get(muni.name);
    out.set(muni.name, meta?.pbo_review_state ?? PBO_REVIEW_STATE.unreviewed);
  }
  return out;
}

/**
 * Municipality a PBO signal belongs to.
 *
 * `article_source` is set deterministically by the extract-unit builder
 * (`pbo-<name>`), not by the LLM, so it is a reliable fallback when the
 * `municipality` field is absent.
 *
 * @param {{municipality?: string, article_source?: string}} signal
 * @returns {string|null}
 */
export function municipalityOfPboSignal(signal) {
  if (signal?.municipality) return String(signal.municipality);
  const source = String(signal?.article_source ?? '');
  return source.startsWith('pbo-') ? source.slice('pbo-'.length) : null;
}

/**
 * Stamp `pbo_review_state` on each signal, backfilling `municipality`.
 *
 * Signals whose source is not a `pbo-<name>` unit are returned untouched.
 *
 * @param {Array<object>} signals
 * @param {Map<string, string>} stateByMuni
 * @returns {Array<object>} stamped signals
 */
export function stampPboSignalReviewState(signals, stateByMuni) {
  if (!Array.isArray(signals)) return [];
  return signals.map((signal) => {
    const municipality = municipalityOfPboSignal(signal);
    if (municipality == null) return signal;
    return {
      ...signal,
      municipality,
      pbo_review_state: stateByMuni?.get(municipality) ?? PBO_REVIEW_STATE.unreviewed,
    };
  });
}
