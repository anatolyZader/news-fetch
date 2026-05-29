import { NORTH_SUBREGION_IDS, isNorthSubregionId } from '../value_objects/northSubregionId.js';

/** @param {unknown} value */
function localityKeyLabel(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * True when doc uses hierarchical subregions with at least one locality.
 * @param {unknown} doc
 * @returns {boolean}
 */
export function northReferenceDocUsesSubregions(doc) {
  const sub = doc?.subregions;
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return false;
  for (const id of NORTH_SUBREGION_IDS) {
    const bucket = sub[id];
    const list = localityListFromBucket(bucket);
    if (Array.isArray(list) && list.length > 0) return true;
  }
  return false;
}

function localityListFromBucket(bucket) {
  return Array.isArray(bucket) ? bucket : bucket?.localities;
}

function resolveSubregionIdFromRow(row, bucketId) {
  const fromRow = row?.subregionId != null && String(row.subregionId).trim()
    ? String(row.subregionId).trim().toLowerCase()
    : bucketId;
  if (fromRow !== bucketId) {
    throw new Error(
      `north-reference: locality "${localityKeyLabel(row?.canonicalKey)}" has subregionId "${fromRow}" but is under bucket "${bucketId}"`,
    );
  }
  return bucketId;
}

function collectSubregionLocalities(subregions) {
  const raw = [];
  for (const subregionId of NORTH_SUBREGION_IDS) {
    const list = localityListFromBucket(subregions[subregionId]);
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      raw.push({ ...row, subregionId: resolveSubregionIdFromRow(row, subregionId) });
    }
  }
  return raw;
}

/**
 * Flatten north-reference.json document into locality rows (each with subregionId).
 * Supports hierarchical `subregions` or legacy top-level `localities`.
 *
 * @param {unknown} doc
 * @returns {Record<string, unknown>[]}
 */
export function collectRawLocalitiesFromNorthReferenceDoc(doc) {
  if (northReferenceDocUsesSubregions(doc)) {
    return collectSubregionLocalities(doc.subregions);
  }

  if (Array.isArray(doc?.localities) && doc.localities.length > 0) {
    return doc.localities;
  }

  throw new Error(
    'north-reference.json must include subregions.<id>.localities (non-empty somewhere) or a non-empty localities array',
  );
}

/**
 * Build `subregions` object for JSON file: each row omits redundant `subregionId` (parent key is canonical).
 *
 * @param {Array<{ subregionId: string } & Record<string, unknown>>} localities
 * @returns {Record<string, { localities: Record<string, unknown>[] }>}
 */
export function groupLocalitiesIntoSubregionsForFile(localities) {
  /** @type {Record<string, { localities: Record<string, unknown>[] }>} */
  const subregions = {};
  for (const id of NORTH_SUBREGION_IDS) {
    subregions[id] = { localities: [] };
  }
  for (const row of localities) {
    const subregionId = String(row.subregionId ?? '')
      .trim()
      .toLowerCase();
    if (!isNorthSubregionId(subregionId)) {
      throw new Error(`Invalid subregionId on locality "${localityKeyLabel(row.canonicalKey)}": ${subregionId}`);
    }
    const rest = { ...row };
    delete rest.subregionId;
    subregions[subregionId].localities.push(rest);
  }
  for (const id of NORTH_SUBREGION_IDS) {
    subregions[id].localities.sort((a, b) =>
      localityKeyLabel(a.canonicalKey).localeCompare(localityKeyLabel(b.canonicalKey)),
    );
  }
  return subregions;
}
