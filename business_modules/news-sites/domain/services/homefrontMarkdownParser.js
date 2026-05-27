/**
 * Parse homefront markdown exports (extractHomefrontArticles.js format).
 */

import {
  parseHeaderDate,
  parseSectionMeta,
  splitNumberedSections,
} from '../../../../cross-cut-modules/markdown/markdownArticleSections.js';

const HOMEFRONT_FILE_RE = /^articles-homefront-(\d{4}-\d{2}-\d{2})\.md$/;
const FILTERED_FROM_RE = /Filtered from (\d+) main-news articles \(all sites\) → (\d+) relevant/i;
const HOMEFRONT_URL_RE = /\*\*URL:\*\*\s*(https?:\/\/\S+)/;

/**
 * @param {string} content
 * @param {string} sourcePath
 * @returns {{
 *   date: string|null,
 *   filteredFrom: number|null,
 *   filteredTo: number|null,
 *   articles: Array<{
 *     idx1: number,
 *     title: string,
 *     url: string,
 *     publishedAt: string,
 *     source: string,
 *     body: string,
 *     sourceFile: string,
 *   }>,
 * }}
 */
export function parseHomefrontMarkdown(content, sourcePath) {
  const headerDate = parseHeaderDate(content);
  const filterMatch = FILTERED_FROM_RE.exec(content);
  const filteredFrom = filterMatch ? Number.parseInt(filterMatch[1], 10) : null;
  const filteredTo = filterMatch ? Number.parseInt(filterMatch[2], 10) : null;

  const sections = splitNumberedSections(content);
  const articles = [];
  let idx1 = 0;

  for (const section of sections) {
    const meta = parseSectionMeta(section, { urlRe: HOMEFRONT_URL_RE });
    if (!meta) continue;
    idx1 += 1;

    articles.push({
      idx1,
      title: meta.title,
      url: meta.url,
      publishedAt: meta.publishedAt,
      source: meta.source,
      body: meta.body,
      sourceFile: sourcePath,
    });
  }

  return {
    date: headerDate,
    filteredFrom: Number.isFinite(filteredFrom) ? filteredFrom : null,
    filteredTo: Number.isFinite(filteredTo) ? filteredTo : null,
    articles,
  };
}

/** @param {string} fileName */
export function parseHomefrontDateFromFileName(fileName) {
  const m = HOMEFRONT_FILE_RE.exec(fileName);
  return m?.[1] ?? null;
}

export { HOMEFRONT_FILE_RE };
