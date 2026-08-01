/**
 * SQLite persistence for municipal PBO completeness reviews.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAppDatabase } from '../../../../db/persistence/openDatabase.js';
import { randomBytes } from 'node:crypto';
import { IPboReviewStorePort } from '../../domain/ports/IPboReviewStorePort.js';

const DDL = `
CREATE TABLE IF NOT EXISTS pbo_muni_reviews (
  date TEXT NOT NULL,
  municipality TEXT NOT NULL,
  file TEXT NOT NULL DEFAULT '',
  sufficient INTEGER NOT NULL DEFAULT 0,
  gaps_json TEXT NOT NULL DEFAULT '[]',
  questions_json TEXT NOT NULL DEFAULT '[]',
  gaps_hash TEXT NOT NULL DEFAULT '',
  review_token TEXT NOT NULL,
  email_sent_at TEXT,
  email_message_id TEXT,
  language TEXT NOT NULL DEFAULT 'he',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'partially_resolved', 'resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, municipality)
);
CREATE INDEX IF NOT EXISTS idx_pbo_muni_reviews_token ON pbo_muni_reviews(review_token);

CREATE TABLE IF NOT EXISTS pbo_muni_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  municipality TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('web', 'email')),
  answers_json TEXT NOT NULL DEFAULT '[]',
  raw_text TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (date, municipality) REFERENCES pbo_muni_reviews(date, municipality)
);
CREATE INDEX IF NOT EXISTS idx_pbo_muni_replies_lookup ON pbo_muni_replies(date, municipality);
`;

function rowToReview(row) {
  if (!row) return null;
  return {
    date: row.date,
    municipality: row.municipality,
    file: row.file,
    sufficient: Boolean(row.sufficient),
    gaps: JSON.parse(row.gaps_json || '[]'),
    questions: JSON.parse(row.questions_json || '[]'),
    gapsHash: row.gaps_hash,
    reviewToken: row.review_token,
    emailSentAt: row.email_sent_at,
    emailMessageId: row.email_message_id,
    language: row.language,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function newReviewToken() {
  return randomBytes(12).toString('hex');
}

export class PboReviewSqliteStore extends IPboReviewStorePort {
  constructor(dbPath) {
    super();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = openAppDatabase(dbPath);
    this.db.exec(DDL);
  }

  getReview(date, municipality) {
    const row = this.db.prepare(
      `SELECT * FROM pbo_muni_reviews WHERE date = ? AND municipality = ?`,
    ).get(String(date), String(municipality));
    return rowToReview(row);
  }

  getReviewByToken(token) {
    const row = this.db.prepare(
      `SELECT * FROM pbo_muni_reviews WHERE review_token = ?`,
    ).get(String(token));
    return rowToReview(row);
  }

  upsertReview(review) {
    const existing = this.getReview(review.date, review.municipality);
    const token = existing?.reviewToken ?? review.reviewToken ?? newReviewToken();
    this.db.prepare(`
      INSERT INTO pbo_muni_reviews (
        date, municipality, file, sufficient, gaps_json, questions_json, gaps_hash,
        review_token, email_sent_at, email_message_id, language, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(date, municipality) DO UPDATE SET
        file = excluded.file,
        sufficient = excluded.sufficient,
        gaps_json = excluded.gaps_json,
        questions_json = excluded.questions_json,
        gaps_hash = excluded.gaps_hash,
        email_sent_at = COALESCE(excluded.email_sent_at, pbo_muni_reviews.email_sent_at),
        email_message_id = COALESCE(excluded.email_message_id, pbo_muni_reviews.email_message_id),
        language = excluded.language,
        status = excluded.status,
        updated_at = datetime('now')
    `).run(
      review.date,
      review.municipality,
      review.file ?? '',
      review.sufficient ? 1 : 0,
      JSON.stringify(review.gaps ?? []),
      JSON.stringify(review.questions ?? []),
      review.gapsHash ?? '',
      token,
      review.emailSentAt ?? null,
      review.emailMessageId ?? null,
      review.language ?? 'he',
      review.status ?? 'open',
    );
    return this.getReview(review.date, review.municipality);
  }

  listReviewsForDate(date) {
    const rows = this.db.prepare(
      `SELECT * FROM pbo_muni_reviews WHERE date = ? ORDER BY municipality`,
    ).all(String(date));
    return rows.map(rowToReview);
  }

  addReply(reply) {
    const result = this.db.prepare(`
      INSERT INTO pbo_muni_replies (date, municipality, channel, answers_json, raw_text)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      reply.date,
      reply.municipality,
      reply.channel,
      JSON.stringify(reply.answers ?? []),
      reply.rawText ?? '',
    );
    return {
      id: Number(result.lastInsertRowid),
      date: reply.date,
      municipality: reply.municipality,
      channel: reply.channel,
      answers: reply.answers ?? [],
      rawText: reply.rawText ?? '',
      receivedAt: new Date().toISOString(),
    };
  }

  listReplies(date, municipality) {
    const rows = this.db.prepare(
      `SELECT * FROM pbo_muni_replies WHERE date = ? AND municipality = ? ORDER BY id`,
    ).all(String(date), String(municipality));
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      municipality: row.municipality,
      channel: row.channel,
      answers: JSON.parse(row.answers_json || '[]'),
      rawText: row.raw_text,
      receivedAt: row.received_at,
    }));
  }
}

export function createPboReviewSqliteStore(dbPath) {
  return new PboReviewSqliteStore(dbPath);
}
