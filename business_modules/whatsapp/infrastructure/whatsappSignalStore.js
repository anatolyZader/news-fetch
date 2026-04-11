/**
 * SQLite persistence for signals extracted from real-time WhatsApp messages.
 */
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DatabaseSync } from 'node:sqlite';

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
  extracted_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wa_signals_date ON whatsapp_signals(date);
CREATE INDEX IF NOT EXISTS idx_wa_signals_msg ON whatsapp_signals(meta_msg_id);
`;

/**
 * @param {string} dbPath  Absolute path to SQLite file
 */
export function createWhatsAppSignalStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const insertStmt = db.prepare(`
    INSERT INTO whatsapp_signals
      (meta_msg_id, date, signal_type, evidence_type, evidence, scope_level, sender_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
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
        insertStmt.run(
          metaMsgId,
          date,
          s.signal_type,
          s.evidence_type ?? 'observational_reported_fact',
          s.evidence ?? '',
          s.scope_level ?? 'single_case',
          senderPhone ?? null,
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
