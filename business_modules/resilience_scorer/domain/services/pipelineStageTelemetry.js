/**
 * Aggregate C9 stage events from in-memory runs and the cost log.
 */




/**
 * Operator-safe rollup (no reason_counts detail).
 * @param {{ assess?: object, extract?: object }} blocks
 */
export function extractionTelemetryForOperator(blocks) {
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

export {readCostLogStagesForDate, summarizeStageEvents} from '../../../../cross-cut-modules/log/index.js';