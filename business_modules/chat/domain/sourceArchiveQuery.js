/**
 * Unified source archive search/get for chat tools.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseMdSourceId,
  parseLegacyDbSourceId,
  legacyDbSourceId,
} from '../../../cross-cut-modules/source_archive/sourceId.js';
import {
  loadHomefrontArticlesForDate,
  parseMarkdownArticles,
  REPO_ROOT,
} from '../../../cross-cut-modules/source_archive/markdownArticles.js';
import { buildMdSourceIdFromPath } from '../../../cross-cut-modules/source_archive/sourceId.js';

function normalize(s) {
  return String(s ?? '').replaceAll(/\s+/g, ' ').trim();
}

function clip(text, maxChars) {
  const s = String(text ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
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

function mdFallbackCandidates(date, filters, limit, snippetChars, seenIds) {
  const articles = loadHomefrontArticlesForDate(date);
  const out = [];
  for (const article of articles) {
    if (out.length >= limit) break;
    const source_id = buildMdSourceIdFromPath(REPO_ROOT, article.sourceFile, article.idx1);
    if (seenIds.has(source_id)) continue;
    const row = {
      title: article.title,
      source_url: article.url,
      source_type: 'news',
      source_label: article.source,
      body: article.body,
    };
    const hay = `${row.title}\n${row.source_url}\n${row.body}`.toLowerCase();
    if (filters.q && !hay.includes(filters.q)) continue;
    if (filters.url && normalize(row.source_url) !== filters.url) continue;
    if (filters.title && !normalize(row.title).toLowerCase().includes(filters.title)) continue;
    if (filters.sourceType && row.source_type !== filters.sourceType) continue;
    out.push({
      source_id,
      title: normalize(row.title),
      url: normalize(row.source_url),
      source_type: 'news',
      source_label: normalize(row.source_label),
      published_at: normalize(article.publishedAt),
      snippet: clip(row.body, snippetChars),
    });
    seenIds.add(source_id);
  }
  return out;
}

/**
 * @param {object} input
 * @param {ReturnType<import('../../../cross-cut-modules/source_archive/createSourceArchive.js').createSourceArchive>|null} sourceArchive
 */
export function searchSources(input, sourceArchive) {
  const date = normalize(input?.date);
  if (!date) return 'search_sources: date was missing and could not be inferred.';
  if (!sourceArchive) return 'search_sources: source archive is not available.';

  const limit = Math.min(Number(input?.limit ?? 7) || 7, 25);
  const snippetChars = Math.min(Number(input?.snippet_chars ?? 350) || 350, 1200);
  const filters = {
    q: normalize(input?.query).toLowerCase(),
    url: normalize(input?.url),
    title: normalize(input?.title).toLowerCase(),
    sourceType: normalize(input?.source_type),
  };

  if (!filters.q && !filters.url && !filters.title) {
    return 'search_sources: provide at least one of query, url, or title.';
  }

  const archiveHits = sourceArchive.search({
    date,
    query: input?.query,
    url: input?.url,
    title: input?.title,
    source_type: input?.source_type,
    limit,
    snippet_chars: snippetChars,
  });

  const seenIds = new Set(archiveHits.map((h) => h.source_id));
  const out = [...archiveHits];
  if (out.length < limit) {
    out.push(...mdFallbackCandidates(date, filters, limit - out.length, snippetChars, seenIds));
  }

  if (out.length === 0) {
    return 'No matching sources found. Try a different date, loosen the query, or provide the exact URL.';
  }
  return formatCandidates(out);
}

function lookupMdByParsed(mdParsed, maxChars) {
  const abs = resolve(REPO_ROOT, mdParsed.sourceFile);
  if (!existsSync(abs)) return `Markdown file missing for source_id=md:${mdParsed.sourceFile}#${mdParsed.idx1}.`;
  const article = parseMarkdownArticles(readFileSync(abs, 'utf8'), abs)
    .find((x) => x.idx1 === mdParsed.idx1);
  if (!article) return `No article found for source_id=md:${mdParsed.sourceFile}#${mdParsed.idx1}.`;
  return formatFullSource({
    source_id: buildMdSourceIdFromPath(REPO_ROOT, abs, article.idx1),
    title: article.title,
    source_type: 'news',
    source_label: article.source,
    source_url: article.url,
    published_at: article.publishedAt,
    body: article.body,
  }, maxChars);
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
 * @param {ReturnType<import('../../../cross-cut-modules/source_archive/createSourceArchive.js').createSourceArchive>|null} sourceArchive
 * @param {object|null} [evidenceStore] legacy bridge
 */
export function getSource(input, sourceArchive, evidenceStore = null) {
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

  const date = normalize(input?.date);
  if (date && (input?.query || input?.url || input?.title)) {
    const searchText = searchSources({ ...input, date, limit: 1 }, sourceArchive);
    if (!searchText.startsWith('No matching')) return `${searchText}\n\n(Use get_source with source_id from above.)`;
  }

  return `No source found for source_id=${sourceId}. Try search_sources first.`;
}
