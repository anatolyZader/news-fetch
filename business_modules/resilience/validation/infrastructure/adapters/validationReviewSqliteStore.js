/**
 * SQLite persistence for validation review queue (mutable ops state).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { IValidationReviewStorePort } from '../../domain/ports/IValidationReviewStorePort.js';

const VALID_STATUSES = new Set(['pending', 'done', 'skipped', 'deferred']);

const DDL = `
CREATE TABLE IF NOT EXISTS validation_review_items (
  date TEXT NOT NULL,
  scope TEXT NOT NULL,
  article_key TEXT NOT NULL,
  queue_rank INTEGER NOT NULL DEFAULT 0,
  priority REAL NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending',
  article_url TEXT,
  article_source TEXT,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  signals_json TEXT NOT NULL DEFAULT '[]',
  signal_types_json TEXT NOT NULL DEFAULT '[]',
  component_ids_json TEXT NOT NULL DEFAULT '[]',
  catalog_version TEXT,
  scoring_model_version TEXT,
  generated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, scope, article_key)
);
CREATE INDEX IF NOT EXISTS idx_validation_review_items_status
  ON validation_review_items(review_status, date, scope);

CREATE TABLE IF NOT EXISTS validation_review_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  scope TEXT NOT NULL,
  article_key TEXT NOT NULL,
  reviewer_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_validation_review_decisions_lookup
  ON validation_review_decisions(date, scope, article_key);
`;

function rowToItem(row) {
  if (!row) return null;
  return {
    date: row.date,
    scope: row.scope,
    article_key: row.article_key,
    queue_rank: row.queue_rank,
    priority: row.priority,
    review_status: row.review_status,
    article_url: row.article_url,
    article_source: row.article_source,
    reasons: JSON.parse(row.reasons_json || '[]'),
    signals: JSON.parse(row.signals_json || '[]'),
    signal_types: JSON.parse(row.signal_types_json || '[]'),
    component_ids: JSON.parse(row.component_ids_json || '[]'),
    catalog_version: row.catalog_version,
    scoring_model_version: row.scoring_model_version,
    generated_at: row.generated_at,
    updated_at: row.updated_at,
  };
}

export class ValidationReviewSqliteStore extends IValidationReviewStorePort {
  constructor(dbPath) {
    super();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(DDL);
  }

  upsertQueueItems(date, scope, items, meta = {}) {
    const dateStr = String(date);
    const scopeStr = String(scope);
    const generatedAt = meta.generated_at ?? new Date().toISOString();

    this.db.prepare(
      `DELETE FROM validation_review_items WHERE date = ? AND scope = ? AND review_status = 'pending'`,
    ).run(dateStr, scopeStr);

    const insertStmt = this.db.prepare(`
      INSERT INTO validation_review_items (
        date, scope, article_key, queue_rank, priority, review_status,
        article_url, article_source, reasons_json, signals_json,
        signal_types_json, component_ids_json, catalog_version,
        scoring_model_version, generated_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(date, scope, article_key) DO UPDATE SET
        queue_rank = excluded.queue_rank,
        priority = excluded.priority,
        article_url = COALESCE(excluded.article_url, validation_review_items.article_url),
        article_source = COALESCE(excluded.article_source, validation_review_items.article_source),
        reasons_json = excluded.reasons_json,
        signals_json = excluded.signals_json,
        signal_types_json = excluded.signal_types_json,
        component_ids_json = excluded.component_ids_json,
        catalog_version = excluded.catalog_version,
        scoring_model_version = excluded.scoring_model_version,
        generated_at = excluded.generated_at,
        updated_at = datetime('now')
    `);

    for (const item of items ?? []) {
      const key = item.article_key;
      if (!key) continue;
      const existing = this.getItem(dateStr, scopeStr, key);
      const status = existing?.review_status && existing.review_status !== 'pending'
        ? existing.review_status
        : (item.review_status ?? 'pending');
      insertStmt.run(
        dateStr,
        scopeStr,
        String(key),
        Number(item.queue_rank ?? 0),
        Number(item.priority ?? 0),
        status,
        item.article_url ?? null,
        item.article_source ?? null,
        JSON.stringify(item.reasons ?? []),
        JSON.stringify(item.signals ?? []),
        JSON.stringify(item.signal_types ?? []),
        JSON.stringify(item.component_ids ?? []),
        meta.catalog_version ?? null,
        meta.scoring_model_version ?? null,
        generatedAt,
      );
    }
  }

  listItems(date, scope, opts = {}) {
    const status = opts.status ? String(opts.status) : null;
    let sql = `SELECT * FROM validation_review_items WHERE date = ? AND scope = ?`;
    const params = [String(date), String(scope)];
    if (status) {
      sql += ` AND review_status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY queue_rank ASC, priority DESC`;
    return this.db.prepare(sql).all(...params).map(rowToItem);
  }

  getItem(date, scope, articleKey) {
    const row = this.db.prepare(
      `SELECT * FROM validation_review_items WHERE date = ? AND scope = ? AND article_key = ?`,
    ).get(String(date), String(scope), String(articleKey));
    return rowToItem(row);
  }

  updateItemStatus(date, scope, articleKey, status) {
    const s = String(status);
    if (!VALID_STATUSES.has(s)) {
      throw new Error(`Invalid review status: ${s}`);
    }
    this.db.prepare(`
      UPDATE validation_review_items
      SET review_status = ?, updated_at = datetime('now')
      WHERE date = ? AND scope = ? AND article_key = ?
    `).run(s, String(date), String(scope), String(articleKey));
    return this.getItem(date, scope, articleKey);
  }

  appendDecision(decision) {
    const result = this.db.prepare(`
      INSERT INTO validation_review_decisions (
        date, scope, article_key, reviewer_email, action, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      String(decision.date),
      String(decision.scope),
      String(decision.article_key),
      String(decision.reviewerEmail ?? ''),
      String(decision.action),
      JSON.stringify(decision.payload ?? {}),
    );
    return {
      id: Number(result.lastInsertRowid),
      ...decision,
      createdAt: new Date().toISOString(),
    };
  }

  getLatestDecision(date, scope, articleKey) {
    const row = this.db.prepare(`
      SELECT action, payload_json, created_at, reviewer_email
      FROM validation_review_decisions
      WHERE date = ? AND scope = ? AND article_key = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(String(date), String(scope), String(articleKey));
    if (!row) return null;
    let payload;
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      payload = {};
    }
    return {
      action: row.action,
      payload,
      created_at: row.created_at,
      reviewer_email: row.reviewer_email,
    };
  }
}

export function createValidationReviewSqliteStore(dbPath) {
  return new ValidationReviewSqliteStore(dbPath);
}

export function isValidationReviewSqliteEnabled() {
  return process.env.VALIDATION_REVIEW_SQLITE !== '0';
}
