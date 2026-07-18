/**
 * Ensure homefront article markdown is indexed into RAG before assess.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ragPipelineEnabled } from '../../../../cross-cut-modules/retrieval/ragConfig.js';
import { resolveSqlitePath } from '../../../../cross-cut-modules/config/sqlitePath.js';
import { createSourceArchive } from '../../../../db/source_archive/createSourceArchive.js';
import { persistOriginalSources } from '../../../../db/source_archive/persistOriginals.js';
import { buildTargetDates } from './assessSignalsHelpers.js';
import { mdArticlesToArchiveItems } from '../extraction/archiveMarkdownFromMd.js';
import { newsArticlesPath } from '../../domain/services/paths/ingestPaths.js';
import { loadMdFile } from '../../infrastructure/mdReportsLoader.js';

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
 * @param {string} date
 * @returns {Promise<{ indexed: number, skipped: number, touched: boolean }>}
 */
async function indexArticlesForDate(params, date) {
  const { retrievalService, repoRoot, archive } = params;
  const mdPath = newsArticlesPath(date, repoRoot);
  if (!existsSync(mdPath)) return { indexed: 0, skipped: 0, touched: false };

  const abs = resolve(mdPath);
  const { articles } = loadMdFile(abs);
  const items = mdArticlesToArchiveItems(articles, {
    repoRoot,
    absPath: abs,
    date,
    source_type: 'news',
  });

  if (items.length === 0) return { indexed: 0, skipped: 0, touched: true };

  const toIndex = [];
  let skipped = 0;
  for (const item of items) {
    if (isParentIndexed(retrievalService, item.source_id)) {
      skipped += 1;
      continue;
    }
    toIndex.push(item);
  }

  if (toIndex.length === 0) return { indexed: 0, skipped, touched: true };

  persistOriginalSources(archive, toIndex);
  let indexed = 0;
  for (const item of toIndex) {
    await retrievalService.indexArchiveRow(item);
    indexed += 1;
  }

  return { indexed, skipped, touched: true };
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

  const dbPath = sqlitePath ?? resolveSqlitePath(process.env, repoRoot);

  const archive = createSourceArchive(dbPath);
  let ftsDirty = false;

  try {
    for (const date of dateList) {
      const result = await indexArticlesForDate({ retrievalService, repoRoot, archive }, date);
      indexed += result.indexed;
      skipped += result.skipped;
      if (result.touched) datesTouched += 1;
      if (result.indexed > 0) ftsDirty = true;
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
