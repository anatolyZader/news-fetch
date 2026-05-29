/**
 * Parse markdown article exports (homefront, field, audio) into archive-ready rows.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');
export const DEFAULT_HOMEFRONT_MD = 'business_modules/news-sites/articles_extracted/articles-homefront.md';

/**
 * @returns {Array<{ idx1: number, title: string, url: string, publishedAt: string, source: string, body: string, sourceFile: string }>}
 */
export function parseMarkdownArticles(content, sourcePath) {
  const sections = String(content ?? '').split(/\n(?=## \d+\. )/);
  const articles = [];
  let idx1 = 0;
  for (const section of sections) {
    const titleMatch = section.match(/^## \d+\.\s+(.+)/m);
    if (!titleMatch) continue;
    idx1 += 1;
    const title = titleMatch[1].trim();
    const urlMatch = section.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/);
    const publishedMatch = section.match(/\*\*Published:\*\*\s*([^\n]+)/);
    const sourceMatch = section.match(/\*\*Source:\*\*\s*([^\n]+)/);
    const metaEnd = section.lastIndexOf('\n- **');
    const afterMeta = metaEnd >= 0 ? section.slice(metaEnd) : section;
    const bodyStart = afterMeta.indexOf('\n\n');
    let body = bodyStart >= 0 ? afterMeta.slice(bodyStart).trim() : '';
    body = body.replace(/\n---\s*$/, '').trim();
    articles.push({
      idx1,
      title,
      url: urlMatch?.[1]?.trim() ?? '',
      publishedAt: publishedMatch?.[1]?.trim() ?? '',
      source: sourceMatch?.[1]?.trim() ?? '',
      body,
      sourceFile: sourcePath,
    });
  }
  return articles;
}

export function resolveHomefrontPathsForDate(date) {
  const base = (process.env.HOMEFRONT_MD || DEFAULT_HOMEFRONT_MD).trim() || DEFAULT_HOMEFRONT_MD;
  const baseAbs = resolve(REPO_ROOT, base);
  const dated = baseAbs.replace(/\.md$/i, `-${date}.md`);
  return { baseAbs, datedAbs: dated };
}

export function loadHomefrontArticlesForDate(date) {
  const { baseAbs, datedAbs } = resolveHomefrontPathsForDate(date);
  for (const p of [datedAbs, baseAbs]) {
    if (!existsSync(p)) continue;
    try {
      return parseMarkdownArticles(readFileSync(p, 'utf8'), p);
    } catch { /* next */ }
  }
  return [];
}

/**
 * @param {string} absolutePath
 */
export function loadMarkdownArticlesFromFile(absolutePath) {
  if (!existsSync(absolutePath)) return [];
  try {
    return parseMarkdownArticles(readFileSync(absolutePath, 'utf8'), absolutePath);
  } catch {
    return [];
  }
}
