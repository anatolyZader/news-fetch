/**
 * Deterministic aggregations over items that may carry a `geo` envelope.
 * No imports from other business modules.
 */

/**
 * @param {Array<{ geo?: { kind?: string, pboSubregionId?: string, subregionId?: string } }>} items
 * @returns {Record<string, typeof items>}
 */
export function groupSignalsBySubregion(items) {
  const out = {};
  for (const item of items ?? []) {
    const g = item?.geo;
    let key = '_no_geo';
    if (g?.kind === 'resolved') {
      key = g.pboSubregionId ?? g.subregionId ?? '_resolved_no_id';
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
    if (g?.kind === 'resolved' && g.distanceBand) key = g.distanceBand;
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
