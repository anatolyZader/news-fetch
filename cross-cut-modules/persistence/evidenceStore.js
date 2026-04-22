/**
 * SQLite persistence for ingested evidence items and analysis runs.
 * Uses Node built-in node:sqlite (same as evidenceDraftStore).
 *
 * Tables:
 *   evidence_items  — one row per article / audio scene from any source
 *   analysis_runs   — one row per completed resilience analysis
 */
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS evidence_items (
  id          INTEGER PRIMARY KEY,
  date        TEXT    NOT NULL,
  source_type TEXT    NOT NULL,
  source_label TEXT,
  source_url  TEXT,
  title       TEXT,
  body        TEXT    NOT NULL DEFAULT '',
  published_at TEXT,
  ingested_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_items_dedup
  ON evidence_items(date, COALESCE(source_url,''), COALESCE(title,''));

CREATE INDEX IF NOT EXISTS idx_evidence_items_date
  ON evidence_items(date);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id           INTEGER PRIMARY KEY,
  date         TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  report_json  TEXT,
  report_md    TEXT,
  source_types TEXT,
  total_items  INTEGER,
  total_signals INTEGER
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_date
  ON analysis_runs(date);
`;

/**
 * @param {string} dbPath  Absolute path to SQLite file
 */
export function createEvidenceStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch { /* ignore */ }

  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO evidence_items
      (date, source_type, source_label, source_url, title, body, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const selectByDate = db.prepare(`
    SELECT id, date, source_type, source_label, source_url, title, body, published_at
    FROM evidence_items
    WHERE date = ?
    ORDER BY id ASC
  `);

  const selectById = db.prepare(`
    SELECT id, date, source_type, source_label, source_url, title, body, published_at
    FROM evidence_items
    WHERE id = ?
    LIMIT 1
  `);

  const countByDate = db.prepare(`
    SELECT COUNT(*) as n FROM evidence_items WHERE date = ?
  `);

  const insertRun = db.prepare(`
    INSERT INTO analysis_runs (date, report_json, report_md, source_types, total_items, total_signals)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const latestRun = db.prepare(`
    SELECT report_json, report_md, created_at, source_types, total_items, total_signals
    FROM analysis_runs
    WHERE date = ?
    ORDER BY id DESC
    LIMIT 1
  `);

  return {
    /**
     * Bulk-insert evidence items. Silently skips duplicates (same date+url+title).
     * @param {Array<{date: string, source_type: string, source_label?: string, source_url?: string, title?: string, body: string, published_at?: string}>} items
     * @returns {number} number of rows actually inserted
     */
    insertItems(items) {
      let inserted = 0;
      for (const item of items) {
        const result = insertItem.run(
          item.date,
          item.source_type,
          item.source_label ?? null,
          item.source_url ?? null,
          item.title ?? null,
          item.body,
          item.published_at ?? null,
        );
        inserted += result.changes ?? 0;
      }
      return inserted;
    },

    /**
     * Return all evidence items for a given date.
     * @param {string} date YYYY-MM-DD
     * @returns {Array<object>}
     */
    getByDate(date) {
      return selectByDate.all(date);
    },

    /**
     * Return a single evidence item by DB id, or null.
     * @param {number} id
     */
    getById(id) {
      const row = selectById.get(id);
      return row ?? null;
    },

    /**
     * Check whether any evidence items exist for a given date.
     * @param {string} date YYYY-MM-DD
     */
    hasItemsForDate(date) {
      const row = countByDate.get(date);
      return (row?.n ?? 0) > 0;
    },

    /**
     * Save a completed analysis run.
     * @param {{ date: string, reportJson: object, reportMd?: string, sourceTypes: string[], totalItems: number, totalSignals: number }} run
     */
    saveRun({ date, reportJson, reportMd, sourceTypes, totalItems, totalSignals }) {
      insertRun.run(
        date,
        JSON.stringify(reportJson),
        reportMd ?? null,
        JSON.stringify(sourceTypes),
        totalItems,
        totalSignals,
      );
    },

    /**
     * Return the most recent analysis run for a date, or null.
     * @param {string} date YYYY-MM-DD
     * @returns {{ reportJson: object, reportMd: string|null, createdAt: string, sourceTypes: string[], totalItems: number, totalSignals: number } | null}
     */
    getLatestRunForDate(date) {
      const row = latestRun.get(date);
      if (!row) return null;
      return {
        reportJson: JSON.parse(row.report_json),
        reportMd: row.report_md ?? null,
        createdAt: row.created_at,
        sourceTypes: JSON.parse(row.source_types ?? '[]'),
        totalItems: row.total_items,
        totalSignals: row.total_signals,
      };
    },
  };
}
