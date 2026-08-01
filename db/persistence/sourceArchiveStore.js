/**
 * SQLite persistence for original source text (source archive).
 * One row per stable source_id; retention keyed on date.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { openAppDatabase } from './openDatabase.js';
import { ensureSourceId } from '../source_archive/sourceId.js';
import { EPHEMERAL_SOURCE_TYPES } from '../source_archive/retentionPolicy.js';

const DDL = `
CREATE TABLE IF NOT EXISTS source_archive (
  source_id     TEXT PRIMARY KEY NOT NULL,
  date          TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  source_label  TEXT,
  source_url    TEXT,
  title         TEXT,
  body          TEXT NOT NULL DEFAULT '',
  published_at  TEXT,
  module_ref    TEXT,
  content_hash  TEXT,
  ingested_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_source_archive_date
  ON source_archive(date);

CREATE INDEX IF NOT EXISTS idx_source_archive_type_date
  ON source_archive(source_type, date);
`;

function normalize(s) {
  return String(s ?? '').replaceAll(/\s+/g, ' ').trim();
}

function safeLower(s) {
  return normalize(s).toLowerCase();
}

function clip(text, maxChars) {
  const s = String(text ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
}

function bodyHash(body) {
  return createHash('sha256').update(String(body ?? ''), 'utf8').digest('hex');
}

function rowMatchesSearchFilters(row, { q, url, title, sourceType }) {
  if (sourceType && row.source_type !== sourceType) return false;
  if (url && normalize(row.source_url) !== url) return false;
  if (title && !safeLower(row.title).includes(title)) return false;
  if (q) {
    const hay = safeLower(
      `${row.title ?? ''}\n${row.source_url ?? ''}\n${row.body ?? ''}\n${row.source_label ?? ''}`,
    );
    if (!hay.includes(q)) return false;
  }
  return true;
}

function formatSearchRow(row, snippetChars) {
  return {
    source_id: row.source_id,
    title: normalize(row.title),
    url: normalize(row.source_url),
    source_type: normalize(row.source_type),
    source_label: normalize(row.source_label),
    published_at: normalize(row.published_at),
    snippet: clip(normalize(row.body), snippetChars),
  };
}

function filterSearchRows(rows, filters) {
  const { limit, snippetChars, q, url, title, sourceType } = filters;
  const out = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    if (!rowMatchesSearchFilters(row, { q, url, title, sourceType })) continue;
    out.push(formatSearchRow(row, snippetChars));
  }
  return out;
}

/**
 * @param {string} dbPath
 */
export function createSourceArchiveStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAppDatabase(dbPath);
  db.exec(DDL);
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch { /* ignore */ }

  const upsertStmt = db.prepare(`
    INSERT INTO source_archive (
      source_id, date, source_type, source_label, source_url, title, body,
      published_at, module_ref, content_hash, ingested_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source_id) DO UPDATE SET
      date = excluded.date,
      source_type = excluded.source_type,
      source_label = excluded.source_label,
      source_url = excluded.source_url,
      title = excluded.title,
      body = excluded.body,
      published_at = excluded.published_at,
      module_ref = excluded.module_ref,
      content_hash = excluded.content_hash,
      ingested_at = datetime('now')
  `);

  const getByIdStmt = db.prepare(`
    SELECT source_id, date, source_type, source_label, source_url, title, body,
           published_at, module_ref, content_hash, ingested_at
    FROM source_archive
    WHERE source_id = ?
    LIMIT 1
  `);

  const listByDateStmt = db.prepare(`
    SELECT source_id, date, source_type, source_label, source_url, title, body,
           published_at, module_ref
    FROM source_archive
    WHERE date = ?
    ORDER BY source_id ASC
  `);

  const listByDateRangeStmt = db.prepare(`
    SELECT source_id, date, source_type, source_label, source_url, title, body,
           published_at, module_ref
    FROM source_archive
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC, source_id ASC
  `);

  const purgeEphemeralStmt = db.prepare(`
    DELETE FROM source_archive
    WHERE date < ? AND source_type IN ('news', 'radio', 'social')
  `);

  return {
    close() {
      db.close();
    },

    /**
     * @param {object} item
     * @param {{ repoRoot?: string, mdPath?: string, mdIndex?: number }} [idOpts]
     * @returns {string} source_id used
     */
    upsert(item, idOpts = {}) {
      const source_id = ensureSourceId(item, idOpts);
      const body = String(item.body ?? '');
      upsertStmt.run(
        source_id,
        String(item.date ?? '').trim(),
        String(item.source_type ?? 'unknown').trim(),
        item.source_label ?? null,
        item.source_url ?? null,
        item.title ?? null,
        body,
        item.published_at ?? null,
        item.module_ref ?? null,
        bodyHash(body),
      );
      return source_id;
    },

    /**
     * @param {string} sourceId
     * @param {{ max_chars?: number }} [opts]
     */
    getBySourceId(sourceId, opts = {}) {
      const row = getByIdStmt.get(String(sourceId ?? '').trim());
      if (!row) return null;
      const maxChars = opts.max_chars ?? 25000;
      const body = clip(row.body, maxChars);
      return { ...row, body };
    },

    /**
     * @param {string} date YYYY-MM-DD
     */
    listByDate(date) {
      return listByDateStmt.all(String(date ?? '').trim());
    },

    /**
     * @param {{ date_from: string, date_to: string, source_type?: string, limit?: number }} input
     */
    listByDateRange(input) {
      const dateFrom = String(input?.date_from ?? '').trim();
      const dateTo = String(input?.date_to ?? input?.date_from ?? '').trim();
      if (!dateFrom || !dateTo) return [];
      const sourceType = normalize(input?.source_type);
      const limit = Math.min(Math.max(Number.parseInt(String(input?.limit ?? 100), 10) || 100, 1), 500);
      const rows = listByDateRangeStmt.all(dateFrom, dateTo);
      const out = [];
      for (const row of rows) {
        if (out.length >= limit) break;
        if (sourceType && row.source_type !== sourceType) continue;
        out.push(row);
      }
      return out;
    },

    /**
     * @param {{ date?: string, date_from?: string, date_to?: string, query?: string, source_type?: string, url?: string, title?: string, limit?: number, snippet_chars?: number, allow_empty_query?: boolean }} input
     */
    search(input) {
      const date = String(input?.date ?? '').trim();
      const dateFrom = String(input?.date_from ?? date).trim();
      const dateTo = String(input?.date_to ?? date).trim();
      if (!dateFrom || !dateTo) return [];

      const limit = Math.min(Math.max(Number.parseInt(String(input?.limit ?? 7), 10) || 7, 1), 25);
      const snippetChars = Math.min(
        Math.max(Number.parseInt(String(input?.snippet_chars ?? 350), 10) || 350, 80),
        1200,
      );
      const q = safeLower(input?.query);
      const url = normalize(input?.url);
      const title = safeLower(input?.title);
      const sourceType = normalize(input?.source_type);
      const allowEmptyQuery = input?.allow_empty_query === true
        || Boolean(sourceType)
        || Boolean(url)
        || Boolean(title);

      if (!allowEmptyQuery && !q && !url && !title) return [];

      const rows = dateFrom === dateTo
        ? listByDateStmt.all(dateFrom)
        : listByDateRangeStmt.all(dateFrom, dateTo);

      return filterSearchRows(rows, { limit, snippetChars, q, url, title, sourceType });
    },

    /**
     * Delete only ephemeral source types (news, radio, social) before cutoff.
     * Field, visits, whatsapp, manual, audio, video, etc. are never purged.
     * @param {string} cutoffDate YYYY-MM-DD
     */
    purgeEphemeralBeforeDate(cutoffDate) {
      const cutoff = String(cutoffDate ?? '').trim();
      const result = purgeEphemeralStmt.run(cutoff);
      return {
        deleted: result.changes ?? 0,
        cutoff,
        types: [...EPHEMERAL_SOURCE_TYPES],
      };
    },

    /**
     * @deprecated Use purgeEphemeralBeforeDate — only ephemeral types are purged.
     * @param {string} cutoffDate YYYY-MM-DD
     */
    purgeBeforeDate(cutoffDate) {
      return this.purgeEphemeralBeforeDate(cutoffDate);
    },
  };
}
