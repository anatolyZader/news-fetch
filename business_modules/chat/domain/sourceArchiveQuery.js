/**
 * Unified source archive search/get/list for chat tools.
 */
import { resolveStateStore } from '../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}
import { resolve } from 'node:path';
import {
  parseMdSourceId,
  parseLegacyDbSourceId,
  legacyDbSourceId,
  buildMdSourceIdFromPath,
} from '../../../db/source_archive/sourceId.js';
import {
  parseMarkdownArticles,
  REPO_ROOT,
} from '../../../db/source_archive/markdownArticles.js';
import {
  loadFilesystemCandidates,
  getFilesystemSourceById,
} from '../../../db/source_archive/filesystemFallbacks.js';
import { chatRetrievalCacheKey } from '../../../cross-cut-modules/retrieval/chatRetrievalCache.js';

function normalize(s) {
  return String(s ?? '').replaceAll(/\s+/g, ' ').trim();
}

function clip(text, maxChars) {
  const s = String(text ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
}

function resolveDateRange(input) {
  const date = normalize(input?.date);
  const dateFrom = normalize(input?.date_from) || date;
  const dateTo = normalize(input?.date_to) || dateFrom;
  return { dateFrom, dateTo };
}

function formatCandidates(rows) {
  return rows.map((m, i) => (
    `[${i + 1}] source_id=${m.source_id}\n` +
    (m.title ? `title: ${m.title}\n` : '') +
    (m.source_type ? `source_type: ${m.source_type}\n` : '') +
    (m.source_label ? `source_label: ${m.source_label}\n` : '') +
    (m.published_at ? `published_at: ${m.published_at}\n` : '') +
    (m.url ? `url: ${m.url}\n` : '') +
    `snippet: ${m.snippet}`
  )).join('\n\n');
}

function formatFullSource(row, maxChars) {
  return (
    `source_id=${row.source_id}\n` +
    (row.title ? `title: ${normalize(row.title)}\n` : '') +
    (row.source_type ? `source_type: ${row.source_type}\n` : '') +
    (row.source_label ? `source_label: ${normalize(row.source_label)}\n` : '') +
    (row.published_at ? `published_at: ${normalize(row.published_at)}\n` : '') +
    (row.source_url ? `url: ${normalize(row.source_url)}\n` : '') +
    `\n${clip(row.body, maxChars)}`
  );
}

function mergeArchiveAndFilesystem(input, sourceArchive, opts = {}) {
  const { dateFrom, dateTo } = resolveDateRange(input);
  if (!dateFrom || !dateTo) return { error: 'date was missing and could not be inferred.' };

  const limit = Math.min(Number(input?.limit ?? 7) || 7, 25);
  const snippetChars = Math.min(Number(input?.snippet_chars ?? 350) || 350, 1200);
  const filters = {
    q: normalize(input?.query).toLowerCase(),
    url: normalize(input?.url),
    title: normalize(input?.title).toLowerCase(),
    sourceType: normalize(input?.source_type),
  };

  const needsTextFilter = !opts.allowEmptyQuery
    && !filters.q && !filters.url && !filters.title && !filters.sourceType;

  if (needsTextFilter) {
    return { error: 'provide at least one of query, url, title, or source_type.' };
  }

  const archiveHits = sourceArchive.search({
    date: dateFrom,
    date_from: dateFrom,
    date_to: dateTo,
    query: input?.query,
    url: input?.url,
    title: input?.title,
    source_type: input?.source_type,
    limit,
    snippet_chars: snippetChars,
    allow_empty_query: opts.allowEmptyQuery || Boolean(filters.sourceType),
  });

  const seenIds = new Set(archiveHits.map((h) => h.source_id));
  const out = [...archiveHits];
  if (out.length < limit) {
    out.push(...loadFilesystemCandidates(dateFrom, dateTo, {
      sourceType: filters.sourceType || undefined,
      q: filters.q,
      url: filters.url,
      title: filters.title,
      limit: limit - out.length,
      snippetChars,
      seenIds,
    }));
  }

  return { out, dateFrom, dateTo };
}

function formatDateRangeLabel(dateFrom, dateTo) {
  if (dateTo === dateFrom) return dateFrom;
  return `${dateFrom}–${dateTo}`;
}

/**
 * @param {object} input
 * @param {ReturnType<import('../../../db/source_archive/createSourceArchive.js').createSourceArchive>|null} sourceArchive
 */
export function listSources(input, sourceArchive) {
  const date = normalize(input?.date);
  if (!date) return 'list_sources: date was missing and could not be inferred.';
  if (!sourceArchive) return 'list_sources: source archive is not available.';

  const result = mergeArchiveAndFilesystem(
    { ...input, date_to: input?.date_to ?? input?.date },
    sourceArchive,
    { allowEmptyQuery: true },
  );
  if (result.error) return `list_sources: ${result.error}`;

  if (result.out.length === 0) {
    return `No sources found for ${formatDateRangeLabel(result.dateFrom, result.dateTo)}.`;
  }
  return formatCandidates(result.out);
}

function tryCachedSearchHits(q, date, retrievalCache) {
  if (!q || !retrievalCache) return null;
  const cacheKey = chatRetrievalCacheKey(
    retrievalCache.sessionId ?? '',
    q,
    'national',
    date,
  );
  const cached = retrievalCache.get(cacheKey);
  if (!cached?.searchHits?.length) return null;
  return formatCandidates(cached.searchHits);
}

function cacheSearchHits(retrievalCache, q, date, ragHits) {
  if (!retrievalCache) return;
  const cacheKey = chatRetrievalCacheKey(
    retrievalCache.sessionId ?? '',
    q,
    'national',
    date,
  );
  const prev = retrievalCache.get(cacheKey) ?? {};
  retrievalCache.set(cacheKey, { ...prev, searchHits: ragHits });
}

async function tryRagSearch(input, q, date, retrievalService, retrievalCache) {
  if (!q || !retrievalService?.retrieval?.searchArchiveChunks) return null;
  try {
    const ragHits = await retrievalService.retrieval.searchArchiveChunks({
      query: q,
      date,
      date_from: input?.date_from,
      date_to: input?.date_to ?? date,
      source_type: input?.source_type,
      limit: Math.min(Number(input?.limit ?? 7) || 7, 25),
      snippet_chars: input?.snippet_chars,
    });
    if (!ragHits?.length) return null;
    cacheSearchHits(retrievalCache, q, date, ragHits);
    return formatCandidates(ragHits);
  } catch (err) {
    console.error('searchSources RAG:', err.message);
    return null;
  }
}

/**
 * @param {object} input
 * @param {ReturnType<import('../../../db/source_archive/createSourceArchive.js').createSourceArchive>|null} sourceArchive
 * @param {{ retrieval?: { searchArchiveChunks: Function } }|null} [retrievalService]
 * @param {{ retrievalCache?: ReturnType<import('../../../cross-cut-modules/retrieval/chatRetrievalCache.js').createChatRetrievalCache> }|null} [opts]
 */
export async function searchSources(input, sourceArchive, retrievalService = null, opts = {}) {
  const date = normalize(input?.date);
  if (!date) return 'search_sources: date was missing and could not be inferred.';
  if (!sourceArchive) return 'search_sources: source archive is not available.';

  const q = normalize(input?.query);
  const retrievalCache = opts?.retrievalCache ?? null;

  const cachedResult = tryCachedSearchHits(q, date, retrievalCache);
  if (cachedResult) return cachedResult;

  const ragResult = await tryRagSearch(input, q, date, retrievalService, retrievalCache);
  if (ragResult) return ragResult;

  const result = mergeArchiveAndFilesystem(
    { ...input, date_to: input?.date_to ?? input?.date },
    sourceArchive,
    { allowEmptyQuery: Boolean(normalize(input?.source_type)) },
  );
  if (result.error) return `search_sources: ${result.error}`;

  if (result.out.length === 0) {
    return 'No matching sources found. Try a different date, loosen the query, or provide the exact URL.';
  }
  return formatCandidates(result.out);
}

function lookupMdByParsed(mdParsed, maxChars) {
  const abs = resolve(REPO_ROOT, mdParsed.sourceFile);
  if (!getStore().existsSync(abs)) return `Markdown file missing for source_id=md:${mdParsed.sourceFile}#${mdParsed.idx1}.`;
  const article = parseMarkdownArticles(getStore().readFileSync(abs, 'utf8'), abs)
    .find((x) => x.idx1 === mdParsed.idx1);
  if (!article) return `No article found for source_id=md:${mdParsed.sourceFile}#${mdParsed.idx1}.`;
  return formatFullSource({
    source_id: buildMdSourceIdFromPath(REPO_ROOT, abs, article.idx1),
    title: article.title,
    source_type: inferTypeFromMdPath(mdParsed.sourceFile),
    source_label: article.source,
    source_url: article.url,
    published_at: article.publishedAt,
    body: article.body,
  }, maxChars);
}

function inferTypeFromMdPath(relPath) {
  if (relPath.includes('homefront') || relPath.includes('news-sites')) return 'news';
  if (relPath.includes('field-reports') || relPath.includes('visits')) return 'field';
  if (relPath.includes('articles-audio')) return 'radio';
  if (relPath.includes('whatsapp')) return 'whatsapp';
  return 'manual';
}

function lookupLegacyDb(dbId, evidenceStore, maxChars) {
  if (!evidenceStore?.getById) return null;
  const row = evidenceStore.getById(dbId);
  if (!row) return null;
  return formatFullSource({
    source_id: legacyDbSourceId(row.id),
    title: row.title,
    source_type: row.source_type,
    source_label: row.source_label,
    source_url: row.source_url,
    published_at: row.published_at,
    body: row.body,
  }, maxChars);
}

/**
 * @param {object} input
 * @param {ReturnType<import('../../../db/source_archive/createSourceArchive.js').createSourceArchive>|null} sourceArchive
 * @param {object|null} [evidenceStore] legacy bridge
 */
export async function getSource(input, sourceArchive, evidenceStore = null) {
  const sourceId = normalize(input?.source_id);
  const maxChars = Math.min(Number(input?.max_chars ?? 8000) || 8000, 25_000);

  if (!sourceId) {
    return 'get_source: source_id is required.';
  }
  if (!sourceArchive) return 'get_source: source archive is not available.';

  const archived = sourceArchive.getBySourceId(sourceId, { max_chars: maxChars });
  if (archived) {
    return formatFullSource({
      source_id: archived.source_id,
      title: archived.title,
      source_type: archived.source_type,
      source_label: archived.source_label,
      source_url: archived.source_url,
      published_at: archived.published_at,
      body: archived.body,
    }, maxChars);
  }

  const mdParsed = parseMdSourceId(sourceId);
  if (mdParsed) return lookupMdByParsed(mdParsed, maxChars);

  const legacyId = parseLegacyDbSourceId(sourceId);
  if (legacyId != null) {
    const leg = lookupLegacyDb(legacyId, evidenceStore, maxChars);
    if (leg) return leg;
  }

  const fsRow = getFilesystemSourceById(sourceId, maxChars);
  if (fsRow) {
    return formatFullSource({
      source_id: fsRow.source_id,
      title: fsRow.title,
      source_type: fsRow.source_type,
      source_label: fsRow.source_label,
      source_url: fsRow.source_url,
      published_at: fsRow.published_at,
      body: fsRow.body,
    }, maxChars);
  }

  const date = normalize(input?.date);
  if (date && (input?.query || input?.url || input?.title || input?.source_type)) {
    const searchText = await searchSources({ ...input, date, limit: 1 }, sourceArchive);
    if (!searchText.startsWith('No matching')) return `${searchText}\n\n(Use get_source with source_id from above.)`;
  }

  return `No source found for source_id=${sourceId}. Try search_sources or list_sources first.`;
}
