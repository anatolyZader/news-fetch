/**
 * Source mix normalization index (SMNI) — comparability guard for regional vs national views.
 *
 * Pipeline position: STAGE-2 assess — compares structured vs digital source mix between
 * regional and national signal sets before cross-scope interpretation.
 *
 * Owns: source-type counts/shares and comparability index (mix delta, not resilience scores).
 * Does NOT: filter signals, compute component evidence, or assign headline scores
 * (min-math — count-based evidence only downstream).
 *
 * Key collaborators: `dataVoid/sourceChannels.js`, regional scope assess paths,
 * report comparison context builders.
 */

import {
  FIELD_SOURCE_TYPES as STRUCTURED_SOURCE_TYPES,
  DIGITAL_SOURCE_TYPES,
} from './dataVoid/sourceChannels.js';

// ---------------------------------------------------------------------------
// Source mix computation
// ---------------------------------------------------------------------------

/**
 * Count signals by source type and compute structured/digital shares.
 * @param {Array<object>} signals
 * @returns {{
 *   total: number,
 *   by_source_type: Record<string, number>,
 *   structured_count: number,
 *   digital_count: number,
 *   structured_share: number,
 *   digital_share: number,
 * }}
 */
export function computeSourceMix(signals) {
  const list = Array.isArray(signals) ? signals : [];
  const bySourceType = {};
  let structured = 0;
  let digital = 0;

  for (const s of list) {
    const st = String(s?.source_type ?? '_unknown').trim().toLowerCase();
    bySourceType[st] = (bySourceType[st] ?? 0) + 1;
    if (STRUCTURED_SOURCE_TYPES.has(st)) structured += 1;
    else if (DIGITAL_SOURCE_TYPES.has(st)) digital += 1;
  }

  const total = list.length;
  return {
    total,
    by_source_type: bySourceType,
    structured_count: structured,
    digital_count: digital,
    structured_share: total > 0 ? structured / total : 0,
    digital_share: total > 0 ? digital / total : 0,
  };
}

// ---------------------------------------------------------------------------
// Cross-scope comparability
// ---------------------------------------------------------------------------

/**
 * Compare regional vs national source mix and emit a comparability index.
 * @param {ReturnType<typeof computeSourceMix>} regionalMix
 * @param {ReturnType<typeof computeSourceMix>} nationalMix
 * @param {number} [threshold=0.35]
 * @returns {object}
 */
export function computeComparability(regionalMix, nationalMix, threshold = 0.35) {
  const structuredDelta = Math.abs(
    (regionalMix?.structured_share ?? 0) - (nationalMix?.structured_share ?? 0),
  );
  const digitalDelta = Math.abs(
    (regionalMix?.digital_share ?? 0) - (nationalMix?.digital_share ?? 0),
  );
  const mixDelta = Math.max(structuredDelta, digitalDelta);
  const comparabilityIndex = Math.max(0, Math.round((1 - mixDelta) * 1000) / 1000);
  const comparable = mixDelta <= threshold;

  return {
    comparable,
    comparability_index: comparabilityIndex,
    structured_share_delta: Math.round(structuredDelta * 1000) / 1000,
    digital_share_delta: Math.round(digitalDelta * 1000) / 1000,
    threshold,
    regional_mix: regionalMix,
    national_mix: nationalMix,
  };
}

/**
 * Build full comparison context for a regional scope against national baseline.
 * @param {Array<object>} regionalSignals
 * @param {Array<object>} nationalSignals
 * @param {string} scopeId
 * @param {number} [threshold]
 * @returns {object}
 */
export function buildComparisonContext(regionalSignals, nationalSignals, scopeId, threshold) {
  const regionalMix = computeSourceMix(regionalSignals);
  const nationalMix = computeSourceMix(nationalSignals);
  const comparability = computeComparability(regionalMix, nationalMix, threshold);
  return {
    scope: scopeId,
    comparison_scope: 'national',
    ...comparability,
  };
}
