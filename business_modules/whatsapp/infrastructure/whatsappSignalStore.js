/**
 * SQLite persistence for signals extracted from real-time WhatsApp messages.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { denormalizedGeoColumns } from '../../../cross-cut-modules/geo/geoSqliteColumns.js';

const DDL = `
CREATE TABLE IF NOT EXISTS whatsapp_signals (
  id            INTEGER PRIMARY KEY,
  meta_msg_id   TEXT    NOT NULL,
  date          TEXT    NOT NULL,
  signal_type   TEXT    NOT NULL,
  evidence_type TEXT    NOT NULL,
  evidence      TEXT    NOT NULL DEFAULT '',
  scope_level   TEXT    NOT NULL DEFAULT 'single_case',
  sender_phone  TEXT,
  geo_json      TEXT,
  geo_kind      TEXT,
  geo_canonical_key TEXT,
  geo_entity_type TEXT,
  geo_pbo_subregion_id TEXT,
  geo_distance_band TEXT,
  geo_quality TEXT,
  geo_usable_for_metrics INTEGER,
  geo_requires_review INTEGER,
  geo_scope_confidence TEXT,
  geo_reference_version TEXT,
  geo_border_reference_version TEXT,
  geo_policy_version TEXT,
  extracted_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wa_signals_date ON whatsapp_signals(date);
CREATE INDEX IF NOT EXISTS idx_wa_signals_msg ON whatsapp_signals(meta_msg_id);
`;

function ensureColumns(db) {
  const cols = db.prepare(`PRAGMA table_info(whatsapp_signals)`).all().map((r) => r.name);
  const has = new Set(cols);
  const add = (name, type) => {
    if (has.has(name)) return;
    db.exec(`ALTER TABLE whatsapp_signals ADD COLUMN ${name} ${type};`);
    has.add(name);
  };
  add('geo_json', 'TEXT');
  add('geo_kind', 'TEXT');
  add('geo_canonical_key', 'TEXT');
  add('geo_entity_type', 'TEXT');
  add('geo_pbo_subregion_id', 'TEXT');
  add('geo_distance_band', 'TEXT');
  add('geo_quality', 'TEXT');
  add('geo_usable_for_metrics', 'INTEGER');
  add('geo_requires_review', 'INTEGER');
  add('geo_scope_confidence', 'TEXT');
  add('geo_reference_version', 'TEXT');
  add('geo_border_reference_version', 'TEXT');
  add('geo_policy_version', 'TEXT');
}

/**
 * @param {string} dbPath  Absolute path to SQLite file
 */
export function createWhatsAppSignalStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  ensureColumns(db);

  const insertStmt = db.prepare(`
    INSERT INTO whatsapp_signals
      (meta_msg_id, date, signal_type, evidence_type, evidence, scope_level, sender_phone,
       geo_json, geo_kind, geo_canonical_key, geo_entity_type, geo_pbo_subregion_id, geo_distance_band,
       geo_quality, geo_usable_for_metrics, geo_requires_review, geo_scope_confidence,
       geo_reference_version, geo_border_reference_version, geo_policy_version)
    VALUES (?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?)
  `);

  const getByDateStmt = db.prepare(
    `SELECT * FROM whatsapp_signals WHERE date = ? ORDER BY extracted_at ASC`,
  );

  const getByMsgIdStmt = db.prepare(
    `SELECT * FROM whatsapp_signals WHERE meta_msg_id = ? ORDER BY id ASC`,
  );

  return {
    /**
     * Bulk insert signals extracted from a single message.
     * @param {string} metaMsgId
     * @param {string} date  YYYY-MM-DD
     * @param {object[]} signals
     * @param {string} [senderPhone]
     */
    insertSignals(metaMsgId, date, signals, senderPhone) {
      for (const s of signals) {
        const cols = denormalizedGeoColumns(s?.geo);
        insertStmt.run(
          metaMsgId,
          date,
          s.signal_type,
          s.evidence_type ?? 'observational_reported_fact',
          s.evidence ?? '',
          s.scope_level ?? 'single_case',
          senderPhone ?? null,
          cols.geoJson,
          cols.kind,
          cols.canonicalKey,
          cols.entityType,
          cols.pboSubregionId,
          cols.distanceBand,
          cols.quality,
          cols.usable,
          cols.review,
          cols.scope,
          cols.refVer,
          cols.borderVer,
          cols.policyVer,
        );
      }
    },

    /** @returns {Array} All signals for a given date */
    getByDate(date) {
      return getByDateStmt.all(date);
    },

    /** @returns {Array} Signals for a specific message */
    getByMsgId(metaMsgId) {
      return getByMsgIdStmt.all(metaMsgId);
    },
  };
}
