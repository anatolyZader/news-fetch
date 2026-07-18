/**
 * Archive original articles from markdown export files into source_archive.
 */
import { resolve } from 'node:path';
import { createSourceArchive } from '../../../../db/source_archive/createSourceArchive.js';
import { persistOriginalSources } from '../../../../db/source_archive/persistOriginals.js';
import { buildMdSourceIdFromPath } from '../../../../db/source_archive/sourceId.js';
import { loadMdFile } from '../../infrastructure/mdReportsLoader.js';

/**
 * Map loadMdFile() articles to source_archive rows.
 *
 * @param {Array<object>} articles
 * @param {{ repoRoot: string, absPath: string, date: string, source_type: string }} ctx
 */
export function mdArticlesToArchiveItems(articles, { repoRoot, absPath, date, source_type }) {
  return articles
    .filter((a) => String(a.body ?? '').trim())
    .map((a, i) => ({
      source_id: buildMdSourceIdFromPath(repoRoot, absPath, i + 1),
      date,
      source_type,
      source_label: a.source ?? '',
      source_url: a.url ?? '',
      title: a.title ?? '',
      body: String(a.body ?? '').trim(),
      published_at: a.publishedAt ?? date,
      module_ref: absPath,
    }));
}

/**
 * @param {string[]} filePaths
 * @param {{ date: string, source_type: string, repoRoot: string, sqlitePath: string, retrievalIndexer?: object|null }} opts
 */
export async function archiveMarkdownFiles(filePaths, opts) {
  const indexer = opts.retrievalIndexer ?? null;
  const archive = createSourceArchive(opts.sqlitePath, {
    retrievalIndexer: indexer ? null : undefined,
  });
  let archived = 0;
  for (const fp of filePaths) {
    const abs = resolve(fp);
    const { articles, date: fileDate } = loadMdFile(abs);
    const date = opts.date || fileDate || new Date().toISOString().slice(0, 10);
    const items = mdArticlesToArchiveItems(articles, {
      repoRoot: opts.repoRoot,
      absPath: abs,
      date,
      source_type: opts.source_type,
    });
    const r = persistOriginalSources(archive, items);
    archived += r.archived;
    if (indexer?.indexArchiveRow) {
      for (const item of items) {
        await indexer.indexArchiveRow(item);
      }
      if (indexer.rebuildFts) indexer.rebuildFts();
    }
  }
  archive.close();
  return archived;
}
