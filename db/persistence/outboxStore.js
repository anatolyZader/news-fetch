/**
 * Outbox-lite: queue domain events for async dispatch in-process.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAppDatabase } from './openDatabase.js';
import { runInTransaction } from './sqliteTransaction.js';

const DDL = `
CREATE TABLE IF NOT EXISTS outbox_events (
  id           INTEGER PRIMARY KEY,
  event_type   TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON outbox_events(processed_at) WHERE processed_at IS NULL;
`;

/**
 * @param {string} dbPath
 */
export function createOutboxStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAppDatabase(dbPath);
  db.exec(DDL);

  const insert = db.prepare(`
    INSERT INTO outbox_events (event_type, payload_json) VALUES (?, ?)
  `);
  const listPending = db.prepare(`
    SELECT id, event_type, payload_json FROM outbox_events
    WHERE processed_at IS NULL ORDER BY id ASC LIMIT ?
  `);
  const markProcessed = db.prepare(`
    UPDATE outbox_events SET processed_at = datetime('now') WHERE id = ?
  `);

  return {
    enqueue(eventType, payload) {
      runInTransaction(db, () => {
        insert.run(eventType, JSON.stringify(payload));
      });
    },
    listPending(limit = 50) {
      return listPending.all(limit).map((row) => ({
        id: row.id,
        eventType: row.event_type,
        payload: JSON.parse(row.payload_json),
      }));
    },
    markProcessed(id) {
      markProcessed.run(id);
    },
  };
}
