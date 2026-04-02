/**
 * SQLite persistence for incoming WhatsApp messages.
 * Uses the same node:sqlite pattern as recordingJobStore.js.
 */
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            INTEGER PRIMARY KEY,
  meta_msg_id   TEXT    UNIQUE NOT NULL,
  group_jid     TEXT,
  sender_phone  TEXT    NOT NULL,
  sender_name   TEXT,
  message_text  TEXT    NOT NULL DEFAULT '',
  timestamp_utc TEXT    NOT NULL,
  date          TEXT    NOT NULL,
  ingested_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_date ON whatsapp_messages(date);
`;

/**
 * @param {string} dbPath  Absolute path to SQLite file
 */
export function createWhatsAppMessageStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO whatsapp_messages
      (meta_msg_id, group_jid, sender_phone, sender_name, message_text, timestamp_utc, date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const getByDateStmt = db.prepare(`
    SELECT * FROM whatsapp_messages WHERE date = ? ORDER BY timestamp_utc ASC
  `);

  const hasMsgIdStmt = db.prepare(`
    SELECT 1 FROM whatsapp_messages WHERE meta_msg_id = ? LIMIT 1
  `);

  return {
    /**
     * Insert a message (silently skips duplicates via INSERT OR IGNORE).
     * @returns {boolean} true if inserted, false if duplicate
     */
    insert({ metaMsgId, groupJid, senderPhone, senderName, messageText, timestampUtc, date }) {
      const result = insertStmt.run(metaMsgId, groupJid, senderPhone, senderName, messageText, timestampUtc, date);
      return result.changes > 0;
    },

    /** @returns {Array} All messages for a given date, ordered by timestamp */
    getByDate(date) {
      return getByDateStmt.all(date);
    },

    /** @returns {boolean} Whether a message with this Meta ID already exists */
    hasMsgId(metaMsgId) {
      return hasMsgIdStmt.get(metaMsgId) != null;
    },
  };
}
