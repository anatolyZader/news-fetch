/**
 * Map parsed markdown articles to source archive upsert payloads.
 */
import { buildMdSourceIdFromPath } from './sourceId.js';

/**
 * @param {Array<{ idx1: number, title: string, url: string, publishedAt: string, source: string, body: string, sourceFile: string }>} articles
 * @param {{ date: string, source_type: string, repoRoot: string, module_ref?: string }} meta
 */
export function articlesToArchiveItems(articles, meta) {
  const { date, source_type, repoRoot, module_ref } = meta;
  return articles
    .filter((a) => String(a.body ?? '').trim().length > 0)
    .map((a) => ({
      source_id: buildMdSourceIdFromPath(repoRoot, a.sourceFile, a.idx1),
      date,
      source_type,
      source_label: a.source ?? '',
      source_url: a.url ?? '',
      title: a.title ?? '',
      body: String(a.body ?? '').trim(),
      published_at: a.publishedAt ?? date,
      module_ref: module_ref ?? a.sourceFile,
    }));
}
