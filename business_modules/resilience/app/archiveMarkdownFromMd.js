/**
 * Archive original articles from markdown export files into source_archive.
 */
import { resolve } from 'node:path';
import { createSourceArchive } from '../../../cross-cut-modules/source_archive/createSourceArchive.js';
import { persistOriginalSources } from '../../../cross-cut-modules/source_archive/persistOriginals.js';
import { buildMdSourceIdFromPath } from '../../../cross-cut-modules/source_archive/sourceId.js';
import { loadMdFile } from '../infrastructure/mdReportsLoader.js';

/**
 * @param {string[]} filePaths
 * @param {{ date: string, source_type: string, repoRoot: string, sqlitePath: string }} opts
 */
export function archiveMarkdownFiles(filePaths, opts) {
  const archive = createSourceArchive(opts.sqlitePath);
  let archived = 0;
  for (const fp of filePaths) {
    const abs = resolve(fp);
    const { articles, date: fileDate } = loadMdFile(abs);
    const date = opts.date || fileDate || new Date().toISOString().slice(0, 10);
    const items = articles
      .filter((a) => String(a.body ?? '').trim())
      .map((a, i) => ({
        source_id: buildMdSourceIdFromPath(opts.repoRoot, abs, i + 1),
        date,
        source_type: opts.source_type,
        source_label: a.source ?? '',
        source_url: a.url ?? '',
        title: a.title ?? '',
        body: String(a.body ?? '').trim(),
        published_at: a.publishedAt ?? date,
        module_ref: abs,
      }));
    archived += persistOriginalSources(archive, items).archived;
  }
  archive.close();
  return archived;
}
