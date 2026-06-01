/**
 * Filesystem fallbacks when SQLite source_archive rows are missing (e.g. after ephemeral purge).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  loadHomefrontArticlesForDate,
  loadMarkdownArticlesFromFile,
  parseMarkdownArticles,
  REPO_ROOT,
} from './markdownArticles.js';
import { buildMdSourceIdFromPath, buildArchiveSourceId, parseMdSourceId } from './sourceId.js';

function normalize(s) {
  return String(s ?? '').replaceAll(/\s+/g, ' ').trim();
}

function clip(text, maxChars) {
  const s = String(text ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
}

function rowToCandidate(row, snippetChars) {
  return {
    source_id: row.source_id,
    title: normalize(row.title),
    url: normalize(row.source_url ?? row.url),
    source_type: normalize(row.source_type),
    source_label: normalize(row.source_label),
    published_at: normalize(row.published_at),
    snippet: clip(normalize(row.body), snippetChars),
  };
}

function matchesFilters(row, filters) {
  if (filters.sourceType && row.source_type !== filters.sourceType) return false;
  if (filters.url && normalize(row.source_url ?? row.url) !== filters.url) return false;
  if (filters.title && !normalize(row.title).toLowerCase().includes(filters.title)) return false;
  const hay = `${row.title ?? ''}\n${row.source_url ?? row.url ?? ''}\n${row.body ?? ''}`.toLowerCase();
  if (filters.q && !hay.includes(filters.q)) return false;
  return true;
}

function pushCandidate(out, seenIds, row, snippetChars, limit, filters) {
  if (out.length >= limit) return;
  if (seenIds.has(row.source_id)) return;
  if (!matchesFilters(row, filters)) return;
  out.push(rowToCandidate(row, snippetChars));
  seenIds.add(row.source_id);
}

function loadFieldArticlesForDate(date) {
  const p = resolve(REPO_ROOT, 'business_modules/visits/data', `articles-field-reports-${date}.md`);
  if (!existsSync(p)) return [];
  return loadMarkdownArticlesFromFile(p).map((a) => ({
    source_id: buildMdSourceIdFromPath(REPO_ROOT, p, a.idx1),
    title: a.title,
    source_url: a.url,
    source_type: 'field',
    source_label: a.source,
    body: a.body,
    published_at: a.publishedAt || date,
  }));
}

function loadRadioArticlesForDate(date) {
  const out = [];
  let names;
  try {
    names = readdirSync(REPO_ROOT).filter(
      (f) => f.startsWith('articles-audio-') && f.includes(date) && f.endsWith('.md'),
    );
  } catch {
    return out;
  }
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const p = join(REPO_ROOT, name);
    for (const a of loadMarkdownArticlesFromFile(p)) {
      out.push({
        source_id: buildMdSourceIdFromPath(REPO_ROOT, p, a.idx1),
        title: a.title,
        source_url: a.url,
        source_type: 'radio',
        source_label: a.source,
        body: a.body,
        published_at: a.publishedAt || date,
      });
    }
  }
  return out;
}

function loadWhatsappArticlesForDate(date) {
  const p = resolve(REPO_ROOT, 'business_modules/whatsapp/reports', `whatsapp_reports-${date}.md`);
  if (!existsSync(p)) return [];
  return loadMarkdownArticlesFromFile(p).map((a) => ({
    source_id: buildMdSourceIdFromPath(REPO_ROOT, p, a.idx1),
    title: a.title,
    source_url: a.url,
    source_type: 'whatsapp',
    source_label: a.source,
    body: a.body,
    published_at: a.publishedAt || date,
  }));
}

function loadSocialFromBundle(date) {
  const p = resolve(REPO_ROOT, 'business_modules/social_media/data', `signals-social-${date}.json`);
  if (!existsSync(p)) return [];
  try {
    const bundle = JSON.parse(readFileSync(p, 'utf8'));
    const findings = bundle.findings ?? [];
    return findings.map((f) => {
      const body = String(f.quote_original ?? f.text ?? '').trim();
      if (!body) return null;
      const item = {
        date,
        source_type: 'social',
        source_url: f.url ?? '',
        title: `${f.platform ?? 'social'}: ${f.speaker_role ?? ''}`.trim(),
        source_label: f.platform ?? 'social',
        body,
        published_at: f.date ?? date,
      };
      return {
        ...item,
        source_id: buildArchiveSourceId(item),
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function loadNewsArticlesForDate(date) {
  return loadHomefrontArticlesForDate(date).map((a) => ({
    source_id: buildMdSourceIdFromPath(REPO_ROOT, a.sourceFile, a.idx1),
    title: a.title,
    source_url: a.url,
    source_type: 'news',
    source_label: a.source,
    body: a.body,
    published_at: a.publishedAt || date,
  }));
}

const TYPE_LOADERS = {
  news: loadNewsArticlesForDate,
  field: loadFieldArticlesForDate,
  radio: loadRadioArticlesForDate,
  whatsapp: loadWhatsappArticlesForDate,
  social: loadSocialFromBundle,
};

/**
 * @param {string} date
 * @param {string} [sourceType]
 * @returns {Array<object>}
 */
export function loadFilesystemRowsForDate(date, sourceType) {
  const loaders = sourceType && TYPE_LOADERS[sourceType]
    ? [TYPE_LOADERS[sourceType]]
    : Object.values(TYPE_LOADERS);
  const rows = [];
  for (const load of loaders) {
    rows.push(...load(date));
  }
  return rows;
}

function enumerateDates(from, to) {
  const out = [];
  const startMs = Date.parse(`${from}T12:00:00`);
  const endMs = Date.parse(`${to}T12:00:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return out;
  const dayMs = 86400000;
  for (let currentMs = startMs; currentMs <= endMs; currentMs += dayMs) {
    out.push(new Date(currentMs).toISOString().slice(0, 10));
  }
  return out;
}

function rowMatchesQuery(row, filters, allowEmptyQuery) {
  if (allowEmptyQuery || !filters.q) return true;
  const hay = `${row.title}\n${row.source_url}\n${row.body}`.toLowerCase();
  return hay.includes(filters.q);
}

function collectCandidatesForDate(date, filters, allowEmptyQuery, out, seenIds, limit, snippetChars) {
  const rows = loadFilesystemRowsForDate(date, filters.sourceType || undefined);
  for (const row of rows) {
    if (out.length >= limit) break;
    if (!rowMatchesQuery(row, filters, allowEmptyQuery)) continue;
    pushCandidate(out, seenIds, row, snippetChars, limit, filters);
  }
}

/**
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {{ sourceType?: string, q?: string, url?: string, title?: string, limit?: number, snippetChars?: number, seenIds?: Set<string> }} opts
 */
export function loadFilesystemCandidates(dateFrom, dateTo, opts = {}) {
  const limit = Math.min(opts.limit ?? 25, 25);
  const snippetChars = opts.snippetChars ?? 350;
  const seenIds = opts.seenIds ?? new Set();
  const filters = {
    q: String(opts.q ?? '').toLowerCase(),
    url: normalize(opts.url),
    title: String(opts.title ?? '').toLowerCase(),
    sourceType: normalize(opts.sourceType),
  };
  const allowEmptyQuery = Boolean(filters.sourceType) || Boolean(filters.url) || Boolean(filters.title) || !filters.q;

  const out = [];
  for (const date of enumerateDates(dateFrom, dateTo)) {
    if (out.length >= limit) break;
    collectCandidatesForDate(date, filters, allowEmptyQuery, out, seenIds, limit, snippetChars);
  }
  return out;
}

/**
 * Resolve full body from filesystem by source_id when not in SQLite.
 * @param {string} sourceId
 * @param {number} maxChars
 */
export function getFilesystemSourceById(sourceId, maxChars = 8000) {
  const mdParsed = parseMdSourceId(sourceId);
  if (mdParsed) {
    const abs = resolve(REPO_ROOT, mdParsed.sourceFile);
    if (!existsSync(abs)) return null;
    const article = parseMarkdownArticles(readFileSync(abs, 'utf8'), abs)
      .find((x) => x.idx1 === mdParsed.idx1);
    if (!article) return null;
    return {
      source_id: sourceId,
      title: article.title,
      source_type: inferTypeFromPath(mdParsed.sourceFile),
      source_label: article.source,
      source_url: article.url,
      published_at: article.publishedAt,
      body: clip(article.body, maxChars),
    };
  }
  if (sourceId.startsWith('archive:')) {
    return searchFilesystemByArchiveId(sourceId, maxChars);
  }
  return null;
}

function inferTypeFromPath(relPath) {
  if (relPath.includes('articles-homefront') || relPath.includes('news-sites')) return 'news';
  if (relPath.includes('field-reports') || relPath.includes('visits')) return 'field';
  if (relPath.includes('articles-audio') || relPath.startsWith('articles-audio')) return 'radio';
  if (relPath.includes('whatsapp')) return 'whatsapp';
  return 'manual';
}

function searchFilesystemByArchiveId(sourceId, maxChars) {
  const dataDir = resolve(REPO_ROOT, 'business_modules/social_media/data');
  let bundleFiles;
  try {
    bundleFiles = readdirSync(dataDir).filter((f) => f.startsWith('signals-social-') && f.endsWith('.json'));
  } catch {
    return null;
  }
  for (const f of bundleFiles) {
    const date = f.match(/signals-social-(\d{4}-\d{2}-\d{2})\.json/)?.[1];
    if (!date) continue;
    for (const row of loadSocialFromBundle(date)) {
      if (row.source_id === sourceId) {
        return { ...row, body: clip(row.body, maxChars) };
      }
    }
  }
  return null;
}

/**
 * Collect archive-indexable documents for RAG (filesystem + would-be rows).
 * @param {string} date
 */
export function collectFilesystemDocsForDate(date) {
  const rows = loadFilesystemRowsForDate(date);
  return rows.map((row) => ({
    docId: row.source_id,
    kind: 'archive',
    text: `${row.title ?? ''}\n${row.body ?? ''}`.trim(),
    meta: {
      source_id: row.source_id,
      source_type: row.source_type,
      url: row.source_url ?? row.url,
      date,
    },
  }));
}
