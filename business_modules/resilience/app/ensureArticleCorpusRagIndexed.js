/**
 * Ensure homefront article markdown is indexed into RAG before assess.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ragPipelineEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { createSourceArchive } from '../../../db/source_archive/createSourceArchive.js';
import { persistOriginalSources } from '../../../db/source_archive/persistOriginals.js';
import { buildMdSourceIdFromPath } from '../../../db/source_archive/sourceId.js';
import { buildTargetDates } from './assessSignalsHelpers.js';
import { newsArticlesPath } from '../domain/services/pipelineArtifactPaths.js';
import { loadMdFile } from '../infrastructure/mdReportsLoader.js';

/**
 * @returns {boolean}
 */
export function assessRagBackfillEnabled() {
  if (process.env.RESILIENCE_ASSESS_RAG_BACKFILL === '0') return false;
  return ragPipelineEnabled();
}

/**
 * @param {object} retrievalService
 * @param {string} sourceId
 */
function isParentIndexed(retrievalService, sourceId) {
  const listFn = retrievalService?.retrieval?.listArchiveChunksByParent;
  if (!listFn) return false;
  const chunks = listFn(sourceId);
  return Array.isArray(chunks) && chunks.length > 0;
}

/**
 * @param {object} params
 * @returns {Promise<{ indexed: number, skipped: number, dates: number, disabled?: boolean }>}
 */
export async function ensureArticleCorpusRagIndexed(params) {
  const {
    targetDate,
    days = 1,
    retrievalService = null,
    repoRoot = process.cwd(),
    sqlitePath = null,
  } = params;

  if (!assessRagBackfillEnabled() || !retrievalService?.indexArchiveRow) {
    return { indexed: 0, skipped: 0, dates: 0, disabled: true };
  }

  const dateList = [...buildTargetDates(targetDate, days)];
  let indexed = 0;
  let skipped = 0;
  let datesTouched = 0;

  const dbPath = sqlitePath
    ?? process.env.SQLITE_PATH?.trim()
    ?? resolve(repoRoot, 'db', 'app.sqlite');

  const archive = createSourceArchive(dbPath);
  let ftsDirty = false;

  try {
    for (const date of dateList) {
      const mdPath = newsArticlesPath(date, repoRoot);
      if (!existsSync(mdPath)) continue;
      datesTouched += 1;

      const abs = resolve(mdPath);
      const { articles } = loadMdFile(abs);
      const items = articles
        .filter((a) => String(a.body ?? '').trim())
        .map((a, i) => ({
          source_id: buildMdSourceIdFromPath(repoRoot, abs, i + 1),
          date,
          source_type: 'news',
          source_label: a.source ?? '',
          source_url: a.url ?? '',
          title: a.title ?? '',
          body: String(a.body ?? '').trim(),
          published_at: a.publishedAt ?? date,
          module_ref: abs,
        }));

      if (items.length === 0) continue;

      const toIndex = [];
      for (const item of items) {
        if (isParentIndexed(retrievalService, item.source_id)) {
          skipped += 1;
          continue;
        }
        toIndex.push(item);
      }

      if (toIndex.length === 0) continue;

      persistOriginalSources(archive, toIndex);
      for (const item of toIndex) {
        await retrievalService.indexArchiveRow(item);
        indexed += 1;
      }
      ftsDirty = true;
    }
  } finally {
    archive.close();
  }

  if (ftsDirty && retrievalService.rebuildFts) {
    retrievalService.rebuildFts();
  }

  if (indexed > 0 || skipped > 0) {
    console.error(
      `  → RAG backfill: indexed ${indexed} articles across ${datesTouched} date(s) (skipped ${skipped} already indexed)`,
    );
  }

  return { indexed, skipped, dates: datesTouched };
}
