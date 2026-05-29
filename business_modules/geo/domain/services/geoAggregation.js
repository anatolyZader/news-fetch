/**
 * Deterministic aggregations over items that may carry a `geo` envelope.
 * No imports from other business modules.
 */

/**
 * @param {Array<{ geo?: object }>} items
 * @returns {Record<string, typeof items>}
 */
export function groupSignalsBySubregion(items) {
  const out = {};
  for (const item of items ?? []) {
    const g = item?.geo;
    let key = '_no_geo';
    if (g?.kind === 'resolved') {
      key = g.classification?.pboSubregionId ?? g.pboSubregionId ?? g.subregionId ?? '_resolved_no_id';
    } else if (item && 'geo' in item && g?.kind === 'unknown') {
      key = '_unknown';
    }
    if (!out[key]) out[key] = [];
    out[key].push(item);
  }
  return out;
}

/**
 * @param {Array<{ geo?: { kind?: string, distanceBand?: string } }>} items
 * @returns {Record<string, typeof items>}
 */
export function groupSignalsByDistanceBand(items) {
  const out = {};
  for (const item of items ?? []) {
    const g = item?.geo;
    let key = '_no_geo';
    if (g?.kind === 'resolved') {
      const band = g.classification?.distanceBand ?? g.distanceBand;
      if (band) key = band;
    }
    else if (item && 'geo' in item && g?.kind === 'unknown') key = '_unknown';
    if (!out[key]) out[key] = [];
    out[key].push(item);
  }
  return out;
}

/**
 * @param {Array<{ geo?: { kind?: string, reason?: string, rawName?: string | null } }>} items
 */
export function summarizeGeoCoverage(items) {
  const list = Array.isArray(items) ? items : [];
  let resolved = 0;
  let unknown = 0;
  /** @type {string[]} */
  const unknownRawSamples = [];
  for (const item of list) {
    if (!item || !('geo' in item)) continue;
    const k = item.geo?.kind;
    if (k === 'resolved') {
      resolved++;
    } else {
      unknown++;
      const raw = item.geo?.rawName;
      if (typeof raw === 'string' && raw.trim() && unknownRawSamples.length < 50) {
        unknownRawSamples.push(raw.trim());
      }
    }
  }
  const withGeo = resolved + unknown;
  const denom = withGeo > 0 ? withGeo : 1;
  return {
    total: list.length,
    withGeoField: withGeo,
    resolved,
    unknown,
    pctResolved: Math.round((1000 * resolved) / denom) / 10,
    unknownRawSamples,
  };
}

function incrementCount(map, key, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function recordUnknownRawName(geo, unknownRawCounts) {
  const raw = geo?.rawName ?? geo?.resolution?.rawInput;
  if (typeof raw !== 'string' || !raw.trim()) return;
  incrementCount(unknownRawCounts, raw.trim());
}

function policyFlag(geo, policyKey, legacyKey) {
  if (geo?.policy && typeof geo.policy === 'object' && Object.hasOwn(geo.policy, policyKey)) {
    return geo.policy[policyKey];
  }
  return geo[legacyKey];
}

function recordResolvedGeoMetrics(geo, counters, fuzzyReviewSamples) {
  const method = geo.resolution?.matchMethod ?? geo.matchMethod ?? 'unknown';
  incrementCount(counters.byMatchMethod, method);
  incrementCount(counters.byProvenance, geo.resolution?.provenance ?? 'unknown');

  if (policyFlag(geo, 'usableForMetrics', 'usableForMetrics') === true) counters.metricsSafe += 1;
  if (policyFlag(geo, 'requiresReview', 'requiresReview') !== true) return;

  counters.requiresReview += 1;
  if (method === 'fuzzy' && fuzzyReviewSamples.length < 15) {
    fuzzyReviewSamples.push(geo.resolution?.matchedVariant ?? geo.matchedName ?? '');
  }
}

/**
 * @param {Array<{ geo?: object, source_type?: string }>} items
 */
export function summarizeGeoQuality(items) {
  const list = Array.isArray(items) ? items.filter((s) => s && 'geo' in s && s.geo) : [];
  const counters = {
    metricsSafe: 0,
    requiresReview: 0,
    bySourceType: {},
    byMatchMethod: {},
    byProvenance: {},
  };
  /** @type {Record<string, number>} */
  const unknownRawCounts = {};
  /** @type {string[]} */
  const fuzzyReviewSamples = [];

  for (const item of list) {
    incrementCount(counters.bySourceType, String(item.source_type ?? '_unknown'));
    const geo = item.geo;
    if (geo?.kind !== 'resolved') {
      recordUnknownRawName(geo, unknownRawCounts);
      continue;
    }
    recordResolvedGeoMetrics(geo, counters, fuzzyReviewSamples);
  }

  const resolvedCount = list.filter((s) => s.geo?.kind === 'resolved').length;
  const denom = list.length > 0 ? list.length : 1;
  const resolvedDenom = resolvedCount > 0 ? resolvedCount : 1;

  const topUnknownRaw = Object.entries(unknownRawCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([raw, count]) => ({ raw, count }));

  return {
    withGeoField: list.length,
    pctUsableForMetrics: Math.round((1000 * counters.metricsSafe) / resolvedDenom) / 10,
    pctRequiresReview: Math.round((1000 * counters.requiresReview) / resolvedDenom) / 10,
    bySourceType: counters.bySourceType,
    byMatchMethod: counters.byMatchMethod,
    byProvenance: counters.byProvenance,
    topUnknownRaw,
    fuzzyReviewSamples,
    resolvedCount,
    pctOfSignalsWithGeo: Math.round((1000 * list.length) / denom) / 10,
  };
}
