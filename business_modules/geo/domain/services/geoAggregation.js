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

/**
 * @param {Array<{ geo?: object, source_type?: string }>} items
 */
export function summarizeGeoQuality(items) {
  const list = Array.isArray(items) ? items.filter((s) => s && 'geo' in s && s.geo) : [];
  let metricsSafe = 0;
  let requiresReview = 0;
  /** @type {Record<string, number>} */
  const bySourceType = {};
  /** @type {Record<string, number>} */
  const byMatchMethod = {};
  /** @type {Record<string, number>} */
  const byProvenance = {};
  /** @type {Record<string, number>} */
  const unknownRawCounts = {};
  /** @type {string[]} */
  const fuzzyReviewSamples = [];

  for (const item of list) {
    const g = item.geo;
    const st = String(item.source_type ?? '_unknown');
    bySourceType[st] = (bySourceType[st] ?? 0) + 1;

    if (g?.kind !== 'resolved') {
      const raw = g?.rawName ?? g?.resolution?.rawInput;
      if (typeof raw === 'string' && raw.trim()) {
        const k = raw.trim();
        unknownRawCounts[k] = (unknownRawCounts[k] ?? 0) + 1;
      }
      continue;
    }

    const method = g.resolution?.matchMethod ?? g.matchMethod ?? 'unknown';
    byMatchMethod[method] = (byMatchMethod[method] ?? 0) + 1;
    const prov = g.resolution?.provenance ?? 'unknown';
    byProvenance[prov] = (byProvenance[prov] ?? 0) + 1;

    const usable =
      g?.policy && typeof g.policy === 'object' && Object.prototype.hasOwnProperty.call(g.policy, 'usableForMetrics')
        ? g.policy.usableForMetrics
        : g.usableForMetrics;
    if (usable === true) metricsSafe++;
    const review =
      g?.policy && typeof g.policy === 'object' && Object.prototype.hasOwnProperty.call(g.policy, 'requiresReview')
        ? g.policy.requiresReview
        : g.requiresReview;
    if (review === true) {
      requiresReview++;
      if (method === 'fuzzy' && fuzzyReviewSamples.length < 15) {
        fuzzyReviewSamples.push(g.resolution?.matchedVariant ?? g.matchedName ?? '');
      }
    }
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
    pctUsableForMetrics: Math.round((1000 * metricsSafe) / resolvedDenom) / 10,
    pctRequiresReview: Math.round((1000 * requiresReview) / resolvedDenom) / 10,
    bySourceType,
    byMatchMethod,
    byProvenance,
    topUnknownRaw,
    fuzzyReviewSamples,
    resolvedCount,
    pctOfSignalsWithGeo: Math.round((1000 * list.length) / denom) / 10,
  };
}
