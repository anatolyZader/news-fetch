/**
 * SQLite persistence for HITL-gated crisis chat budget sessions.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS crisis_budget_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  activated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  activated_by    TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  pool_limit_usd  REAL NOT NULL,
  reason          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deactivated','expired'))
);

CREATE INDEX IF NOT EXISTS idx_crisis_budget_status_expires
  ON crisis_budget_sessions(status, expires_at DESC);
`;

export function createCrisisBudgetSqliteAdapter({ dbPath }) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const insertStmt = db.prepare(`
    INSERT INTO crisis_budget_sessions (activated_by, expires_at, pool_limit_usd, reason, status)
    VALUES (?, ?, ?, ?, 'active')
  `);

  const deactivateStmt = db.prepare(`
    UPDATE crisis_budget_sessions
    SET status = 'deactivated'
    WHERE status = 'active'
  `);

  const expireStaleStmt = db.prepare(`
    UPDATE crisis_budget_sessions
    SET status = 'expired'
    WHERE status = 'active' AND expires_at <= datetime('now')
  `);

  const getActiveStmt = db.prepare(`
    SELECT id, activated_at, activated_by, expires_at, pool_limit_usd, reason, status
    FROM crisis_budget_sessions
    WHERE status = 'active' AND expires_at > datetime('now')
    ORDER BY id DESC
    LIMIT 1
  `);

  return {
    activate({ activatedBy, expiresAt, poolLimitUsd, reason }) {
      expireStaleStmt.run();
      deactivateStmt.run();
      const result = insertStmt.run(
        String(activatedBy ?? ''),
        String(expiresAt),
        Number(poolLimitUsd),
        String(reason ?? ''),
      );
      return getActiveStmt.get();
    },

    deactivate() {
      expireStaleStmt.run();
      deactivateStmt.run();
      return { ok: true };
    },

    getActiveSession() {
      expireStaleStmt.run();
      const row = getActiveStmt.get();
      if (!row) return null;
      return {
        id: row.id,
        activated_at: row.activated_at,
        activated_by: row.activated_by,
        expires_at: row.expires_at,
        pool_limit_usd: row.pool_limit_usd,
        reason: row.reason,
        status: row.status,
        active: true,
      };
    },
  };
}
