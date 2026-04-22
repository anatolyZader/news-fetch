/**
 * On-demand evidence/article full-text lookup for chat tools.
 *
 * Sources:
 * - SQLite evidence_items via createEvidenceStore (news/audio/video/manual bodies)
 * - Markdown homefront exports (articles-homefront*.md) without truncation
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DEFAULT_HOMEFRONT_MD = 'business_modules/news-sites/articles_extracted/articles-homefront.md';

function normalize(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function safeLower(s) {
  return normalize(s).toLowerCase();
}

function clip(text, maxChars) {
  const s = String(text ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
}

function buildDbEvidenceId(id) {
  return `db:evidence_items:${id}`;
}

function parseDbEvidenceId(evidenceId) {
  const m = String(evidenceId ?? '').match(/^db:evidence_items:(\d+)$/);
  if (!m) return null;
  const id = Number.parseInt(m[1], 10);
  return Number.isFinite(id) ? id : null;
}

function buildMdEvidenceId(sourceFile, idx1) {
  return `md:${sourceFile}#${idx1}`;
}

function parseMdEvidenceId(evidenceId) {
  const m = String(evidenceId ?? '').match(/^md:(.+)#(\d+)$/);
  if (!m) return null;
  const sourceFile = m[1];
  const idx1 = Number.parseInt(m[2], 10);
  if (!sourceFile || !Number.isFinite(idx1) || idx1 <= 0) return null;
  return { sourceFile, idx1 };
}

/**
 * Parse a homefront markdown export into article objects (no truncation).
 * Format is the same as produced by extractHomefrontArticles.js.
 * @returns {Array<{ idx1: number, title: string, url: string, publishedAt: string, source: string, body: string, sourceFile: string }>}
 */
function parseHomefrontMd(content, sourcePath) {
  // Split on numbered article headers
  const sections = content.split(/\n(?=## \d+\. )/);
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

    // Body: everything after the last metadata line, before the trailing ---
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

function resolveHomefrontPathsForDate(date) {
  const base = (process.env.HOMEFRONT_MD || DEFAULT_HOMEFRONT_MD).trim() || DEFAULT_HOMEFRONT_MD;
  const baseAbs = resolve(REPO_ROOT, base);
  const dated = baseAbs.replace(/\.md$/i, `-${date}.md`);
  return { baseAbs, datedAbs: dated };
}

function loadHomefrontArticlesForDate(date) {
  const { baseAbs, datedAbs } = resolveHomefrontPathsForDate(date);
  const candidates = [datedAbs, baseAbs];

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const content = readFileSync(p, 'utf8');
      return parseHomefrontMd(content, p);
    } catch {
      // try next candidate
    }
  }
  return [];
}

/**
 * Search evidence items in SQLite for a date.
 * @param {object|null} evidenceStore createEvidenceStore return
 * @param {string} date YYYY-MM-DD
 */
function loadDbEvidenceForDate(evidenceStore, date) {
  if (!evidenceStore || typeof evidenceStore.getByDate !== 'function') return [];
  try {
    return evidenceStore.getByDate(date) ?? [];
  } catch {
    return [];
  }
}

/**
 * Return candidate evidence items (title/url/source + snippet) for a given query.
 *
 * @param {{
 *   date: string,
 *   query?: string,
 *   url?: string,
 *   title?: string,
 *   source_type?: string,
 *   limit?: number,
 *   snippet_chars?: number
 * }} input
 * @param {object|null} evidenceStore
 * @returns {string}
 */
export function searchEvidenceCandidates(input, evidenceStore) {
  const date = normalize(input?.date);
  if (!date) return 'search_evidence: date was missing and could not be inferred.';

  const limit = Math.min(Number(input?.limit ?? 7) || 7, 25);
  const snippetChars = Math.min(Number(input?.snippet_chars ?? 350) || 350, 1200);

  const q = safeLower(input?.query);
  const url = normalize(input?.url);
  const title = safeLower(input?.title);
  const sourceType = normalize(input?.source_type);

  if (!q && !url && !title) {
    return 'search_evidence: provide at least one of query, url, or title.';
  }

  const out = [];
  const push = (row) => {
    if (out.length >= limit) return;
    out.push(row);
  };

  // 1) DB candidates (best because evidence_id can be used for exact lookup)
  const dbRows = loadDbEvidenceForDate(evidenceStore, date);
  for (const r of dbRows) {
    if (out.length >= limit) break;
    if (sourceType && r.source_type !== sourceType) continue;
    if (url && normalize(r.source_url) !== url) continue;

    const hay = safeLower(`${r.title ?? ''}\n${r.source_url ?? ''}\n${r.body ?? ''}\n${r.source_label ?? ''}`);
    const titleOk = title ? safeLower(r.title).includes(title) : true;
    const queryOk = q ? hay.includes(q) : true;
    if (!titleOk || !queryOk) continue;

    const snippet = clip(normalize(r.body), snippetChars);
    push({
      evidence_id: buildDbEvidenceId(r.id),
      title: normalize(r.title),
      url: normalize(r.source_url),
      source_type: normalize(r.source_type),
      source_label: normalize(r.source_label),
      published_at: normalize(r.published_at),
      snippet,
    });
  }

  // 2) Markdown candidates (useful if DB is missing)
  const seenUrl = new Set(out.map((m) => m.url).filter(Boolean));
  if (out.length < limit) {
    const mdArticles = loadHomefrontArticlesForDate(date);
    for (const a of mdArticles) {
      if (out.length >= limit) break;
      if (url && a.url !== url) continue;
      if (a.url && seenUrl.has(a.url)) continue;

      const hay = safeLower(`${a.title}\n${a.url}\n${a.body}\n${a.source}`);
      const titleOk = title ? safeLower(a.title).includes(title) : true;
      const queryOk = q ? hay.includes(q) : true;
      if (!titleOk || !queryOk) continue;

      push({
        evidence_id: buildMdEvidenceId(a.sourceFile, a.idx1),
        title: normalize(a.title),
        url: normalize(a.url),
        source_type: 'news',
        source_label: normalize(a.source),
        published_at: normalize(a.publishedAt),
        snippet: clip(normalize(a.body), snippetChars),
      });
    }
  }

  if (out.length === 0) {
    const hints = [];
    if (dbRows.length === 0) hints.push('No DB evidence rows found for that date.');
    hints.push('Try a different date, loosen the query, or provide the exact URL.');
    return `No matching evidence candidates found.\n\n${hints.join(' ')}`.trim();
  }

  return out.map((m, i) => (
    `[${i + 1}] evidence_id=${m.evidence_id}\n` +
    (m.title ? `title: ${m.title}\n` : '') +
    (m.source_type ? `source_type: ${m.source_type}\n` : '') +
    (m.source_label ? `source_label: ${m.source_label}\n` : '') +
    (m.published_at ? `published_at: ${m.published_at}\n` : '') +
    (m.url ? `url: ${m.url}\n` : '') +
    `snippet: ${m.snippet}`
  )).join('\n\n');
}

/**
 * Lookup evidence/article full text on demand.
 *
 * @param {{
 *   date: string,
 *   evidence_id?: string,
 *   query?: string,
 *   url?: string,
 *   title?: string,
 *   source_type?: string,
 *   limit?: number,
 *   max_chars?: number
 * }} input
 * @param {object|null} evidenceStore
 * @returns {string}
 */
export function lookupEvidenceText(input, evidenceStore) {
  const date = normalize(input?.date);
  if (!date) return 'lookup_evidence: date was missing and could not be inferred.';

  const limit = Math.min(Number(input?.limit ?? 3) || 3, 10);
  const maxChars = Math.min(Number(input?.max_chars ?? 8000) || 8000, 25_000);
  const evidenceId = normalize(input?.evidence_id);
  const q = safeLower(input?.query);
  const url = normalize(input?.url);
  const title = safeLower(input?.title);
  const sourceType = normalize(input?.source_type);

  if (!evidenceId && !q && !url && !title) {
    return 'lookup_evidence: provide at least one of evidence_id, query, url, or title.';
  }

  const matches = [];
  const pushMatch = (m) => {
    if (matches.length >= limit) return;
    matches.push(m);
  };

  // 0) Exact lookup by evidence_id (preferred when provided)
  if (evidenceId) {
    const dbId = parseDbEvidenceId(evidenceId);
    if (dbId != null && evidenceStore && typeof evidenceStore.getById === 'function') {
      const row = evidenceStore.getById(dbId);
      if (row) {
        pushMatch({
          source: buildDbEvidenceId(row.id),
          title: normalize(row.title),
          url: normalize(row.source_url),
          sourceType: normalize(row.source_type),
          sourceLabel: normalize(row.source_label),
          publishedAt: normalize(row.published_at),
          body: clip(row.body, maxChars),
        });
        return matches.map((m, i) => (
          `[#${i + 1}] ${m.title || '(untitled)'}\n` +
          `source: ${m.source}\n` +
          (m.sourceType ? `source_type: ${m.sourceType}\n` : '') +
          (m.sourceLabel ? `source_label: ${m.sourceLabel}\n` : '') +
          (m.publishedAt ? `published_at: ${m.publishedAt}\n` : '') +
          (m.url ? `url: ${m.url}\n` : '') +
          `\n${m.body}`
        )).join('\n\n---\n\n');
      }
      return `No DB evidence found for evidence_id=${evidenceId}.`;
    }

    const mdParsed = parseMdEvidenceId(evidenceId);
    if (mdParsed) {
      const { sourceFile, idx1 } = mdParsed;
      if (existsSync(sourceFile)) {
        try {
          const content = readFileSync(sourceFile, 'utf8');
          const mdArticles = parseHomefrontMd(content, sourceFile);
          const a = mdArticles.find((x) => x.idx1 === idx1);
          if (a) {
            pushMatch({
              source: buildMdEvidenceId(a.sourceFile, a.idx1),
              title: normalize(a.title),
              url: normalize(a.url),
              sourceType: 'news',
              sourceLabel: normalize(a.source),
              publishedAt: normalize(a.publishedAt),
              body: clip(a.body, maxChars),
            });
            return matches.map((m, i) => (
              `[#${i + 1}] ${m.title || '(untitled)'}\n` +
              `source: ${m.source}\n` +
              (m.sourceType ? `source_type: ${m.sourceType}\n` : '') +
              (m.sourceLabel ? `source_label: ${m.sourceLabel}\n` : '') +
              (m.publishedAt ? `published_at: ${m.publishedAt}\n` : '') +
              (m.url ? `url: ${m.url}\n` : '') +
              `\n${m.body}`
            )).join('\n\n---\n\n');
          }
          return `No markdown evidence found for evidence_id=${evidenceId}.`;
        } catch {
          return `Failed to read markdown evidence for evidence_id=${evidenceId}.`;
        }
      }
      return `Markdown file missing for evidence_id=${evidenceId}.`;
    }
  }

  // 1) DB evidence (authoritative full body for ingested items)
  const dbRows = loadDbEvidenceForDate(evidenceStore, date);
  for (const r of dbRows) {
    if (matches.length >= limit) break;
    if (sourceType && r.source_type !== sourceType) continue;
    if (url && normalize(r.source_url) !== url) continue;

    const hay = safeLower(`${r.title ?? ''}\n${r.source_url ?? ''}\n${r.body ?? ''}\n${r.source_label ?? ''}`);
    const titleOk = title ? safeLower(r.title).includes(title) : true;
    const queryOk = q ? hay.includes(q) : true;
    if (!titleOk || !queryOk) continue;

    pushMatch({
      source: buildDbEvidenceId(r.id ?? '?'),
      title: normalize(r.title),
      url: normalize(r.source_url),
      sourceType: normalize(r.source_type),
      sourceLabel: normalize(r.source_label),
      publishedAt: normalize(r.published_at),
      body: clip(r.body, maxChars),
    });
  }

  // 2) Homefront markdown export (useful if DB is missing or caller wants file-backed)
  //    Avoid duplicating DB results by URL when present.
  const seenUrl = new Set(matches.map((m) => m.url).filter(Boolean));
  if (matches.length < limit) {
    const mdArticles = loadHomefrontArticlesForDate(date);
    for (const a of mdArticles) {
      if (matches.length >= limit) break;
      if (url && a.url !== url) continue;
      if (a.url && seenUrl.has(a.url)) continue;

      const hay = safeLower(`${a.title}\n${a.url}\n${a.body}\n${a.source}`);
      const titleOk = title ? safeLower(a.title).includes(title) : true;
      const queryOk = q ? hay.includes(q) : true;
      if (!titleOk || !queryOk) continue;

      pushMatch({
        source: buildMdEvidenceId(a.sourceFile, a.idx1),
        title: normalize(a.title),
        url: normalize(a.url),
        sourceType: 'news',
        sourceLabel: normalize(a.source),
        publishedAt: normalize(a.publishedAt),
        body: clip(a.body, maxChars),
      });
    }
  }

  if (matches.length === 0) {
    const hints = [];
    if (dbRows.length === 0) hints.push('No DB evidence rows found for that date.');
    hints.push('Try a different date, loosen the query, or search by exact URL.');
    return `No matching evidence found.\n\n${hints.join(' ')}`.trim();
  }

  return matches.map((m, i) => (
    `[#${i + 1}] ${m.title || '(untitled)'}\n` +
    `source: ${m.source}\n` +
    (m.sourceType ? `source_type: ${m.sourceType}\n` : '') +
    (m.sourceLabel ? `source_label: ${m.sourceLabel}\n` : '') +
    (m.publishedAt ? `published_at: ${m.publishedAt}\n` : '') +
    (m.url ? `url: ${m.url}\n` : '') +
    `\n${m.body}`
  )).join('\n\n---\n\n');
}

