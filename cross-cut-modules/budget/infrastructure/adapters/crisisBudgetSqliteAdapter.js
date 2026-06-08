/**
 * SQLite persistence for HITL-gated crisis chat budget sessions.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runInTransaction } from '../../../../db/persistence/sqliteTransaction.js';

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

const EXPIRE_STALE_SQL = `
  UPDATE crisis_budget_sessions
  SET status = 'expired'
  WHERE status = 'active' AND expires_at <= datetime('now')
`;

const DEACTIVATE_ACTIVE_SQL = `
  UPDATE crisis_budget_sessions
  SET status = 'deactivated'
  WHERE status = 'active'
`;

const GET_ACTIVE_SQL = `
  SELECT id, activated_at, activated_by, expires_at, pool_limit_usd, reason, status
  FROM crisis_budget_sessions
  WHERE status = 'active' AND expires_at > datetime('now')
  ORDER BY id DESC
  LIMIT 1
`;

function expireStaleSessions(db) {
  db.exec(EXPIRE_STALE_SQL);
}

function deactivateActiveSessions(db) {
  db.exec(DEACTIVATE_ACTIVE_SQL);
}

function getActiveRow(db) {
  return db.prepare(GET_ACTIVE_SQL).get();
}

function mapActiveRow(row) {
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
}

export function createCrisisBudgetSqliteAdapter({ dbPath }) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const insertStmt = db.prepare(`
    INSERT INTO crisis_budget_sessions (activated_by, expires_at, pool_limit_usd, reason, status)
    VALUES (?, ?, ?, ?, 'active')
  `);

  return {
    activate({ activatedBy, expiresAt, poolLimitUsd, reason }) {
      runInTransaction(db, () => {
        expireStaleSessions(db);
        deactivateActiveSessions(db);
        insertStmt.run(
          String(activatedBy ?? ''),
          String(expiresAt),
          Number(poolLimitUsd),
          String(reason ?? ''),
        );
      });
      return getActiveRow(db);
    },

    deactivate() {
      runInTransaction(db, () => {
        expireStaleSessions(db);
        deactivateActiveSessions(db);
      });
      return { ok: true };
    },

    getActiveSession() {
      expireStaleSessions(db);
      return mapActiveRow(getActiveRow(db));
    },
  };
}
