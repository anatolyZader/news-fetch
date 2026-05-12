import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DatabaseSync } from 'node:sqlite';

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
    this.db = new DatabaseSync(dbPath);
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
  }

  /** @param {import('../../domain/value_objects/geoEnrichment.js').GeoUnknown} envelope */
  recordUnknown(envelope) {
    if (!envelope || envelope.kind !== 'unknown') return;
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

