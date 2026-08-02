/**
 * SQLite persistence for product-tour progress (per Firebase uid, per tour).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAppDatabase } from '../../../db/persistence/openDatabase.js';

const DDL = `
CREATE TABLE IF NOT EXISTS tour_progress (
  user_uid TEXT NOT NULL,
  tour_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed', 'dismissed')),
  last_step_index INTEGER NOT NULL DEFAULT 0,
  seen_version INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_uid, tour_id)
);
`;

/**
 * @param {string} dbPath Absolute path to SQLite file
 */
export function createTourProgressStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAppDatabase(dbPath);
  db.exec(DDL);

  return {
    /**
     * @returns {{ tourId: string, status: string, lastStepIndex: number, seenVersion: number, completedAt: string|null } | null}
     */
    getByUid(userUid, tourId) {
      const uid = String(userUid ?? '').trim();
      const tour = String(tourId ?? '').trim();
      if (!uid || !tour) return null;
      const row = db.prepare(
        `SELECT tour_id, status, last_step_index, seen_version, completed_at
         FROM tour_progress WHERE user_uid = ? AND tour_id = ?`,
      ).get(uid, tour);
      if (!row) return null;
      return rowToProgress(row);
    },

    /**
     * @param {{ userUid: string, tourId: string, status: string, lastStepIndex?: number, seenVersion?: number }} input
     */
    upsert({ userUid, tourId, status, lastStepIndex = 0, seenVersion = 1 }) {
      const uid = String(userUid ?? '').trim();
      const tour = String(tourId ?? '').trim();
      if (!uid) throw new Error('userUid required');
      if (!tour) throw new Error('tourId required');

      db.prepare(`
        INSERT INTO tour_progress (user_uid, tour_id, status, last_step_index, seen_version, completed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END, datetime('now'))
        ON CONFLICT(user_uid, tour_id) DO UPDATE SET
          status = excluded.status,
          last_step_index = excluded.last_step_index,
          seen_version = excluded.seen_version,
          completed_at = CASE WHEN excluded.status = 'completed' THEN datetime('now') ELSE NULL END,
          updated_at = datetime('now')
      `).run(uid, tour, status, lastStepIndex, seenVersion, status);

      return this.getByUid(uid, tour);
    },
  };
}

function rowToProgress(row) {
  return {
    tourId: row.tour_id,
    status: row.status,
    lastStepIndex: row.last_step_index ?? 0,
    seenVersion: row.seen_version ?? 1,
    completedAt: row.completed_at ?? null,
  };
}
