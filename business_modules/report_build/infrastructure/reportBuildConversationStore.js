/**
 * SQLite persistence for per-owner report-build conversation state (web).
 *
 * WhatsApp has its own stores; this store is for the web UI flow keyed by `ownerKey` (uid).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS report_build_conversations (
  owner_key   TEXT    PRIMARY KEY,
  state       TEXT    NOT NULL DEFAULT 'idle',
  draft_id    TEXT,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * @param {string} dbPath Absolute path to SQLite file
 */
export function createReportBuildConversationStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const getStmt = db.prepare(
    `SELECT owner_key, state, draft_id, updated_at FROM report_build_conversations WHERE owner_key = ?`,
  );

  const upsertStmt = db.prepare(`
    INSERT INTO report_build_conversations (owner_key, state, draft_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(owner_key) DO UPDATE SET
      state = excluded.state,
      draft_id = excluded.draft_id,
      updated_at = datetime('now')
  `);

  const resetStmt = db.prepare(
    `DELETE FROM report_build_conversations WHERE owner_key = ?`,
  );

  return {
    get(ownerKey) {
      return getStmt.get(ownerKey) ?? null;
    },
    upsert(ownerKey, state, draftId = null) {
      upsertStmt.run(ownerKey, state, draftId);
    },
    reset(ownerKey) {
      resetStmt.run(ownerKey);
    },
  };
}

