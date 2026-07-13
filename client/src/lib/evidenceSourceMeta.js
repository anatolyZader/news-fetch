/**
 * Resolve source metadata for evidence list items (badges + headers).
 */
import {
  groupPoolItemsBySource,
  inferPoolSourceTypeFromArticleSource,
  normalizePoolSourceType,
  poolItemSourceBucket,
} from '../../../business_modules/resilience_scorer/domain/contracts/evidencePoolGrouping.js';
const READABLE_CITATION_DATE = /,\s*\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s*$/;
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;
const READABLE_CITATION_TAIL = /\s*\(([^)]+)\)\s*$/;

/**
 * @param {string|null|undefined} sourceType
 * @returns {string|null}
 */
export function normalizeEvidenceSourceType(sourceType) {
  return normalizePoolSourceType(sourceType);
}

/**
 * @param {string|null|undefined} articleSource
 * @returns {string|null}
 */
export function inferSourceTypeFromArticleSource(articleSource) {
  return inferPoolSourceTypeFromArticleSource(articleSource);
}

/**
 * @param {string} markdown
 * @returns {{ label: string|null, url: string|null }}
 */
export function parseEvidenceCitation(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return { label: null, url: null };
  }

  const linkMatch = markdown.match(MARKDOWN_LINK);
  if (linkMatch) {
    return { label: linkMatch[1].trim(), url: linkMatch[2] };
  }

  const tailMatch = markdown.match(READABLE_CITATION_TAIL);
  if (!tailMatch) return { label: null, url: null };

  let label = tailMatch[1].trim();
  label = label.replace(READABLE_CITATION_DATE, '').trim();
  return { label: label || null, url: null };
}

/**
 * @param {string} markdown
 * @returns {string}
 */
export function stripTrailingEvidenceCitation(markdown) {
  if (typeof markdown !== 'string') return '';
  const withoutLink = markdown.replace(MARKDOWN_LINK, '').trim();
  return withoutLink.replace(READABLE_CITATION_TAIL, '').trim();
}

/**
 * @param {string|null|undefined} url
 * @param {Array<object>|null|undefined} sourceSignals
 * @returns {object|null}
 */
export function findSignalByUrl(url, sourceSignals) {
  if (!url || !sourceSignals?.length) return null;
  return sourceSignals.find((s) => s.article_url === url) ?? null;
}

/**
 * @param {string|null|undefined} label
 * @param {Array<object>|null|undefined} sourceSignals
 * @returns {object|null}
 */
export function findSignalByLabel(label, sourceSignals) {
  const needle = String(label ?? '').trim().toLowerCase();
  if (!needle || !sourceSignals?.length) return null;

  return sourceSignals.find((s) => {
    const articleSource = String(s.article_source ?? '').trim().toLowerCase();
    const title = String(s.article_title ?? s.title ?? '').trim().toLowerCase();
    if (articleSource && (articleSource === needle || articleSource.includes(needle) || needle.includes(articleSource))) {
      return true;
    }
    if (title && (title === needle || title.includes(needle) || needle.includes(title))) {
      return true;
    }
    return false;
  }) ?? null;
}

function metaFromSignal(signal) {
  return {
    source_type: normalizeEvidenceSourceType(signal.source_type),
    article_source: signal.article_source ?? null,
    url: signal.article_url ?? null,
  };
}

function metaFromFields(sourceType, articleSource, url) {
  const normalizedType = normalizeEvidenceSourceType(sourceType)
    ?? inferSourceTypeFromArticleSource(articleSource);
  return {
    source_type: normalizedType,
    article_source: articleSource ?? null,
    url: url ?? null,
  };
}

/**
 * @param {string|object} item
 * @param {Array<object>|null|undefined} sourceSignals
 * @returns {object|null}
 */
export function resolveEvidenceSourceMeta(item, sourceSignals) {
  const md = typeof item === 'string' ? item : (item?.markdown ?? item?.text ?? '');
  const citation = parseEvidenceCitation(md);
  const urlFromMd = md.match(MARKDOWN_LINK)?.[2]
    ?? md.match(/\]\((https?:\/\/[^)]+)\)/)?.[1]
    ?? null;
  const url = (typeof item === 'object' ? item?.url : null) ?? citation.url ?? urlFromMd;

  if (item && typeof item === 'object') {
    const hasMeta = item.source_type || item.article_source;
    if (hasMeta) {
      return metaFromFields(item.source_type, item.article_source, url ?? item.url);
    }
    const signal = findSignalByUrl(url, sourceSignals) ?? findSignalByLabel(citation.label, sourceSignals);
    if (signal) return metaFromSignal(signal);
    if (citation.label) {
      return metaFromFields(null, citation.label, url);
    }
    if (url || item.article_source) return item;
  }

  const signal = findSignalByUrl(url, sourceSignals) ?? findSignalByLabel(citation.label, sourceSignals);
  if (signal) return metaFromSignal(signal);
  if (citation.label) return metaFromFields(null, citation.label, url);
  return null;
}

/**
 * @param {{ article_source?: string|null, source_type?: string|null }} meta
 * @param {string|null|undefined} sourceType
 * @returns {string|null}
 */
export function formatEvidenceArticleSource(meta, sourceType) {
  if (!meta?.article_source) return null;
  if (sourceType === 'pbo') return meta.article_source.replace(/^pbo-/, '');
  return meta.article_source;
}

export function evidenceSourceBucket(item, sourceSignals) {
  if (item && typeof item === 'object' && (item.source_type || item.article_source)) {
    return poolItemSourceBucket(item);
  }
  const meta = resolveEvidenceSourceMeta(item, sourceSignals);
  return poolItemSourceBucket({
    source_type: meta?.source_type,
    article_source: meta?.article_source,
  });
}

/**
 * @param {Array<string|object>} items
 * @param {Array<object>|null|undefined} sourceSignals
 * @returns {Array<{ key: string, items: Array<string|object> }>}
 */
export function groupEvidenceBySourceType(items, sourceSignals) {
  const list = Array.isArray(items) ? items : [];
  const enriched = list.map((item) => {
    if (typeof item === 'object' && item !== null) {
      if (item.source_type || item.article_source) return item;
      const meta = resolveEvidenceSourceMeta(item, sourceSignals);
      return {
        ...item,
        source_type: meta?.source_type ?? item.source_type,
        article_source: meta?.article_source ?? item.article_source,
        url: item.url ?? meta?.url,
      };
    }
    const meta = resolveEvidenceSourceMeta(item, sourceSignals);
    return {
      markdown: item,
      text: item,
      source_type: meta?.source_type,
      article_source: meta?.article_source,
      url: meta?.url,
    };
  });
  return groupPoolItemsBySource(enriched);
}
