/**
 * Compose the PBO review-state port for the assess path.
 *
 * The review store belongs to pbo_report_review; resilience_scorer reaches it
 * only through this composition seam, via that module's public facade — the
 * same pattern as createSignalBundlePort.js.
 *
 * Fail-open by design: if the store is unavailable, unreadable, or disabled,
 * this returns null and the caller keeps whatever extract time stamped. An
 * assessment must never fail because review metadata could not be loaded.
 */
import { resolveSqlitePath } from '../../../../cross-cut-modules/config/sqlitePath.js';

/**
 * @typedef {object} IPboReviewStatePort
 * @property {(dates: string[]) => Promise<Map<string, string>>} loadReviewStates
 *   `${date}|${municipality}` → review state. A missing key means the store has
 *   no row and the caller should keep the extract-time stamp.
 */

/** Kill switch: RESILIENCE_ASSESS_PBO_REVIEW=0 keeps the extract-time stamp only. */
export function isAssessPboReviewEnabled(env = process.env) {
  return env.RESILIENCE_ASSESS_PBO_REVIEW !== '0';
}

/**
 * @param {{ sqlitePath?: string }} [opts]
 * @returns {Promise<IPboReviewStatePort|null>} null when disabled or unavailable
 */
export async function createPboReviewStatePort(opts = {}) {
  if (!isAssessPboReviewEnabled()) return null;
  let loadReviewMetadataMapForDate;
  try {
    ({ loadReviewMetadataMapForDate } = await import('../../../pbo_report_review/index.js'));
  } catch (err) {
    console.error(`  ⚠ PBO review state unavailable, keeping extract-time stamps: ${err.message}`);
    return null;
  }
  const sqlitePath = opts.sqlitePath ?? resolveSqlitePath(process.env);

  return {
    async loadReviewStates(dates) {
      const out = new Map();
      for (const date of new Set(dates ?? [])) {
        try {
          for (const [municipality, meta] of loadReviewMetadataMapForDate(date, sqlitePath)) {
            if (meta?.pbo_review_state) out.set(`${date}|${municipality}`, meta.pbo_review_state);
          }
        } catch (err) {
          // One unreadable date must not lose the others.
          console.error(`  ⚠ PBO review state for ${date} unreadable: ${err.message}`);
        }
      }
      return out;
    },
  };
}
