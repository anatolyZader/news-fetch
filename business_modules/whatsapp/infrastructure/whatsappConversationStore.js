/**
 * SQLite persistence for per-sender WhatsApp conversation state.
 * Tracks where each user is in the chatbot wizard flow.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  phone_number  TEXT    PRIMARY KEY,
  state         TEXT    NOT NULL DEFAULT 'idle',
  draft_id      TEXT,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * @param {string} dbPath  Absolute path to SQLite file
 */
export function createWhatsAppConversationStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const getStmt = db.prepare(
    `SELECT phone_number, state, draft_id, updated_at FROM whatsapp_conversations WHERE phone_number = ?`,
  );

  const upsertStmt = db.prepare(`
    INSERT INTO whatsapp_conversations (phone_number, state, draft_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(phone_number) DO UPDATE SET
      state = excluded.state,
      draft_id = excluded.draft_id,
      updated_at = datetime('now')
  `);

  const resetStmt = db.prepare(
    `DELETE FROM whatsapp_conversations WHERE phone_number = ?`,
  );

  const expireStmt = db.prepare(
    `DELETE FROM whatsapp_conversations WHERE updated_at < datetime('now', '-' || ? || ' minutes')`,
  );

  return {
    /** @returns {{ phone_number: string, state: string, draft_id: string|null, updated_at: string }|null} */
    get(phoneNumber) {
      return getStmt.get(phoneNumber) ?? null;
    },

    upsert(phoneNumber, state, draftId = null) {
      upsertStmt.run(phoneNumber, state, draftId);
    },

    reset(phoneNumber) {
      resetStmt.run(phoneNumber);
    },

    /** Delete conversations older than maxAgeMinutes. @returns {number} rows deleted */
    expireStale(maxAgeMinutes) {
      const result = expireStmt.run(String(maxAgeMinutes));
      return result.changes;
    },
  };
}
