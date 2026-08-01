import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAppDatabase } from './openDatabase.js';

const DDL = `
CREATE TABLE IF NOT EXISTS processed_events (
  event_type    TEXT NOT NULL,
  aggregate_id  TEXT NOT NULL,
  handler_id    TEXT NOT NULL,
  processed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_type, aggregate_id, handler_id)
);
`;

/**
 * Idempotency ledger for outbox handlers.
 * @param {string} dbPath
 */
export function createProcessedEventStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAppDatabase(dbPath);
  db.exec(DDL);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO processed_events (event_type, aggregate_id, handler_id) VALUES (?, ?, ?)
  `);

  return {
    /**
     * @returns {boolean} true if this handler should run (first time)
     */
    claim(eventType, aggregateId, handlerId) {
      const info = insert.run(eventType, aggregateId, handlerId);
      return info.changes > 0;
    },
  };
}
