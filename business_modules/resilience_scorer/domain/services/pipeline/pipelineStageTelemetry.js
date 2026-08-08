/**
 * Aggregate C9 stage events from in-memory runs and the cost log.
 *
 * Pipeline position: post-extract / post-assess — rolls up stage keep/drop counts
 * for user-safe telemetry on the assessment report.
 *
 * Owns: user-facing extraction telemetry rollup (no internal reason counts).
 * Does NOT: emit stage events (extract/assess runners do) or persist cost logs.
 *
 * Key collaborators: `cross-cut-modules/log/` (cost log readers),
 * `app/extraction/extractionStageRunner.js`, report finalize paths.
 */

// ---------------------------------------------------------------------------
// User-safe telemetry rollup
// ---------------------------------------------------------------------------

/**
 * User-safe rollup (no `reason_counts` detail).
 * @param {{ assess?: object, extract?: object }} blocks
 * @returns {object}
 */
export function extractionTelemetryForUser(blocks) {
  const out = {};
  for (const [key, val] of Object.entries(blocks ?? {})) {
    if (!val || typeof val !== 'object') continue;
    out[key] = {
      totals: val.totals,
      per_stage: val.perStage
        ? Object.fromEntries(
          Object.entries(val.perStage).map(([stage, s]) => [
            stage,
            { kept: s.kept, dropped: s.dropped, input: s.input },
          ]),
        )
        : undefined,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cost-log stage readers (re-exported)
// ---------------------------------------------------------------------------

export {readCostLogStagesForDate, summarizeStageEvents} from '../../../../../cross-cut-modules/log/index.js';
