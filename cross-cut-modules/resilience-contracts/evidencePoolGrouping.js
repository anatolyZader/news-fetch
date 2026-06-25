/**
 * Shared evidence pool grouping by source bucket (server + client).
 */

const PBO_SOURCE = /^pbo(?:[-_]|$)/i;
const FIELD_SOURCE = /^(field|visits|field_report|field_whatsapp)$/i;

/**
 * @param {string|null|undefined} sourceType
 * @returns {string|null}
 */
export function normalizePoolSourceType(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (!st) return null;
  if (st === 'news' || st === 'press') return 'press';
  if (FIELD_SOURCE.test(st) || st === 'visits') return 'field';
  if (st === 'pbo_regional') return 'pbo';
  return st;
}

/**
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

const SOURCE_BUCKET_ORDER = ['field', 'pbo', 'press', 'radio', 'social', 'naftali', 'other'];

/**
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
