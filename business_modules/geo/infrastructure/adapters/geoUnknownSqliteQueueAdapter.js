import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAppDatabase } from '../../../../db/persistence/openDatabase.js';

import { IGeoUnknownSinkPort } from '../../domain/ports/IGeoUnknownSinkPort.js';
import { normalizeLocalityLookupKey } from '../../domain/services/resolveLocalityMatch.js';

const DDL = `
CREATE TABLE IF NOT EXISTS geo_unknown_review (
  id                     INTEGER PRIMARY KEY,
  raw_name_norm           TEXT    NOT NULL,
  raw_name_last           TEXT,
  reason                 TEXT    NOT NULL,
  source_type            TEXT    NOT NULL DEFAULT '',
  occurrence_count        INTEGER NOT NULL DEFAULT 0,
  first_seen_at          TEXT    NOT NULL,
  last_seen_at           TEXT    NOT NULL,
  last_geo_reference_version TEXT,
  last_source            TEXT,
  last_candidates_json   TEXT,
  status                 TEXT    NOT NULL DEFAULT 'new',
  reviewer_note          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_unknown_review_dedup
  ON geo_unknown_review(raw_name_norm, reason, source_type);
`;

/**
 * SQLite-backed unknown locality review queue.
 * @param {{ dbPath: string, sourceType?: string|null }} opts
 */
export function createGeoUnknownSqliteQueueAdapter({ dbPath, sourceType = null }) {
  return new GeoUnknownSqliteQueueAdapter(dbPath, sourceType);
}

class GeoUnknownSqliteQueueAdapter extends IGeoUnknownSinkPort {
  /** @param {string} dbPath @param {string|null} sourceType */
  constructor(dbPath, sourceType) {
    super();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = openAppDatabase(dbPath);
    this.db.exec(DDL);
    this.sourceType = sourceType == null ? '' : String(sourceType);

    this.upsertStmt = this.db.prepare(`
      INSERT INTO geo_unknown_review (
        raw_name_norm, raw_name_last, reason, source_type,
        occurrence_count, first_seen_at, last_seen_at,
        last_geo_reference_version, last_source, last_candidates_json
      )
      VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'), ?, ?, ?)
      ON CONFLICT(raw_name_norm, reason, source_type) DO UPDATE SET
        raw_name_last = excluded.raw_name_last,
        occurrence_count = occurrence_count + 1,
        last_seen_at = datetime('now'),
        last_geo_reference_version = excluded.last_geo_reference_version,
        last_source = excluded.last_source,
        last_candidates_json = excluded.last_candidates_json
    `);

    this.listStmt = this.db.prepare(`
      SELECT id, raw_name_norm, raw_name_last, reason, source_type,
             occurrence_count, first_seen_at, last_seen_at, status, reviewer_note,
             last_candidates_json
      FROM geo_unknown_review
      WHERE (? IS NULL OR status = ?)
      ORDER BY occurrence_count DESC, last_seen_at DESC
      LIMIT ?
    `);

    this.updateStatusStmt = this.db.prepare(`
      UPDATE geo_unknown_review
      SET status = ?, reviewer_note = COALESCE(?, reviewer_note)
      WHERE id = ?
    `);
  }

  /**
   * @param {{ status?: string|null, limit?: number }} [opts]
   */
  list(opts = {}) {
    const status = opts.status == null || opts.status === '' ? null : String(opts.status);
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const rows = this.listStmt.all(status, status, limit);
    return rows.map((row) => {
      let candidates;
      try {
        candidates = row.last_candidates_json ? JSON.parse(row.last_candidates_json) : [];
      } catch {
        candidates = [];
      }
      return {
        id: row.id,
        raw_name_norm: row.raw_name_norm,
        raw_name_last: row.raw_name_last,
        reason: row.reason,
        source_type: row.source_type,
        occurrence_count: row.occurrence_count,
        first_seen_at: row.first_seen_at,
        last_seen_at: row.last_seen_at,
        status: row.status,
        reviewer_note: row.reviewer_note,
        candidates,
      };
    });
  }

  /**
   * @param {number} id
   * @param {{ status: string, reviewerNote?: string }} update
   */
  updateStatus(id, update) {
    const allowed = new Set(['new', 'resolved', 'ignored', 'deferred']);
    const status = String(update.status ?? '');
    if (!allowed.has(status)) {
      throw new Error(`Invalid geo unknown status: ${status}`);
    }
    this.updateStatusStmt.run(status, update.reviewerNote ?? null, id);
    return { ok: true, id, status };
  }

  /** @param {import('../../domain/value_objects/geoEnrichment.js').GeoUnknown} envelope */
  recordUnknown(envelope) {
    if (envelope?.kind !== 'unknown') return;
    const raw = envelope.rawName ?? null;
    const norm = raw ? normalizeLocalityLookupKey(raw) : '';
    if (!norm) return;
    const candidatesJson =
      Array.isArray(envelope.candidates) && envelope.candidates.length > 0
        ? JSON.stringify(envelope.candidates)
        : null;
    this.upsertStmt.run(
      norm,
      raw,
      String(envelope.reason ?? 'UNKNOWN'),
      this.sourceType,
      envelope.geoReferenceVersion ?? null,
      envelope.source ?? null,
      candidatesJson,
    );
  }
}

