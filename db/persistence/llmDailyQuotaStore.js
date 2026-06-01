/**
 * SQLite daily LLM usage quotas (validation explain/agent, etc.).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS llm_usage_daily (
  owner_key TEXT NOT NULL,
  day TEXT NOT NULL,
  channel TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_key, day, channel)
);
`;

/**
 * @param {string} dbPath
 */
export function createLlmDailyQuotaStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const getCountStmt = db.prepare(`
    SELECT count FROM llm_usage_daily WHERE owner_key = ? AND day = ? AND channel = ?
  `);
  const upsertStmt = db.prepare(`
    INSERT INTO llm_usage_daily (owner_key, day, channel, count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(owner_key, day, channel) DO UPDATE SET count = count + 1
  `);

  return {
    getDailyCount(ownerKey, day, channel) {
      const row = getCountStmt.get(ownerKey, day, channel);
      return row?.count == null ? 0 : Number(row.count);
    },

    incrementDailyCount(ownerKey, day, channel) {
      upsertStmt.run(ownerKey, day, channel);
    },
  };
}
