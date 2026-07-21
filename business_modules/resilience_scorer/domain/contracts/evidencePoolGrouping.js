/**
 * Evidence pool grouping by ingest source bucket (server + client).
 *
 * Pipeline position: report and client display — groups investigation-pool items
 * for operator-facing evidence panels. Client-safe isomorphic.
 *
 * Owns: source-type normalization, bucket assignment, and stable bucket ordering.
 * Does NOT: signal verification, narrative assembly, or numeric scores (min-math).
 *
 * Key collaborators: citationDisplay.js, operatorSurfaceMode.js,
 * report display components, evidence pool loaders.
 */

const PBO_SOURCE = /^pbo(?:[-_]|$)/i;
/** Legacy source_type values still seen in older bundles. */
const VISITS_SOURCE = /^(visits|field|field_report|field_whatsapp)$/i;

/**
 * Normalize raw source_type strings to canonical pool bucket keys.
 * @param {string|null|undefined} sourceType
 * @returns {string|null}
 */
export function normalizePoolSourceType(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (!st) return null;
  if (st === 'news' || st === 'press') return 'press';
  if (VISITS_SOURCE.test(st)) return 'visits';
  if (st === 'pbo_regional') return 'pbo';
  return st;
}

/**
 * Infer pool source_type from article_source label when source_type is missing.
 * @param {string|null|undefined} articleSource
 * @returns {string|null}
 */
export function inferPoolSourceTypeFromArticleSource(articleSource) {
  const label = String(articleSource ?? '').trim();
  if (!label) return null;
  if (PBO_SOURCE.test(label)) return 'pbo';
  if (/\.(co\.il|com|net|org)$/i.test(label) || /\b(ynet|mako|maariv|walla|haaretz|kikar)\b/i.test(label)) {
    return 'press';
  }
  if (/\b(ice|idf|ministry|משרד)\b/i.test(label)) return 'press';
  return null;
}

/** Stable display order for non-empty source buckets in grouped pool views. */
const SOURCE_BUCKET_ORDER = ['visits', 'pbo', 'press', 'radio', 'social', 'naftali', 'other'];

/**
 * Assign one pool item to a source bucket key for grouping.
 * @param {{ source_type?: string|null, article_source?: string|null }} item
 * @returns {string}
 */
export function poolItemSourceBucket(item) {
  const rawType = item?.source_type;
  if (rawType === 'radio') return 'radio';
  if (rawType === 'social' || rawType === 'telegram') return 'social';
  if (rawType === 'pbo' || rawType === 'pbo_regional') return 'pbo';
  if (rawType === 'naftali') return 'naftali';
  const normalized = normalizePoolSourceType(rawType)
    ?? inferPoolSourceTypeFromArticleSource(item?.article_source);
  if (normalized && SOURCE_BUCKET_ORDER.includes(normalized)) return normalized;
  return 'other';
}

/**
 * Group pool items into ordered { key, items } buckets for UI rendering.
 * @param {Array<object>} items
 * @returns {Array<{ key: string, items: object[] }>}
 */
export function groupPoolItemsBySource(items) {
  const list = Array.isArray(items) ? items : [];
  /** @type {Map<string, object[]>} */
  const buckets = new Map();
  for (const item of list) {
    const bucket = poolItemSourceBucket(item);
    const arr = buckets.get(bucket) ?? [];
    arr.push(item);
    buckets.set(bucket, arr);
  }
  return SOURCE_BUCKET_ORDER
    .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
    .map((key) => ({ key, items: buckets.get(key) ?? [] }));
}

export { SOURCE_BUCKET_ORDER };
