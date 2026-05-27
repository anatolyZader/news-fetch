/**
 * SQLite persistence for radio recording jobs and runs.
 * Uses the same node:sqlite pattern as evidenceDraftStore.js.
 *
 * Schedule format (schedule_json column):
 *   Array of { dayOfWeek: number[], hour: number, minute: number }
 *   dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat  (JS convention)
 *
 * Example — weekday evenings at 18:00 + Friday noon:
 *   [
 *     { "dayOfWeek": [0,1,2,3,4], "hour": 18, "minute": 0 },
 *     { "dayOfWeek": [5],          "hour": 12, "minute": 0 }
 *   ]
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const DDL = `
CREATE TABLE IF NOT EXISTS recording_jobs (
  id           TEXT PRIMARY KEY NOT NULL,
  station      TEXT NOT NULL,
  stream_url   TEXT NOT NULL,
  program      TEXT NOT NULL,
  schedule_json TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  language     TEXT NOT NULL DEFAULT 'he',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recording_runs (
  id                  TEXT PRIMARY KEY NOT NULL,
  job_id              TEXT NOT NULL REFERENCES recording_jobs(id),
  scheduled_start_at  TEXT NOT NULL,
  actual_start_at     TEXT,
  actual_end_at       TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','recording','completed','failed')),
  output_path         TEXT,
  error_msg           TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id, scheduled_start_at)
);
`;

/**
 * @param {string} dbPath  Absolute path to SQLite file (parent dirs created if needed)
 */
export function createRecordingJobStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  // Migrate: add language column if it doesn't exist yet
  const cols = db.prepare(`PRAGMA table_info(recording_jobs)`).all().map((c) => c.name);
  if (!cols.includes('language')) {
    db.exec(`ALTER TABLE recording_jobs ADD COLUMN language TEXT NOT NULL DEFAULT 'he'`);
  }

  return {
    /**
     * @param {{ station: string, streamUrl: string, program: string, schedule: object[], durationSec: number }} p
     * @returns {string} new job id
     */
    addJob({ station, streamUrl, program, schedule, durationSec, language = 'he' }) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO recording_jobs (id, station, stream_url, program, schedule_json, duration_sec, language)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, station, streamUrl, program, JSON.stringify(schedule), durationSec, language);
      return id;
    },

    /** Returns all jobs (enabled + disabled) with schedule parsed from JSON. */
    listJobs() {
      return db.prepare(`SELECT * FROM recording_jobs ORDER BY created_at`).all()
        .map(deserializeJob);
    },

    /** Returns only enabled jobs, schedule parsed. */
    getEnabledJobs() {
      return db.prepare(`SELECT * FROM recording_jobs WHERE enabled = 1`).all()
        .map(deserializeJob);
    },

    setJobEnabled(id, enabled) {
      db.prepare(`UPDATE recording_jobs SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
    },

    deleteJob(id) {
      db.prepare(`DELETE FROM recording_runs WHERE job_id = ?`).run(id);
      db.prepare(`DELETE FROM recording_jobs WHERE id = ?`).run(id);
    },

    /**
     * Insert a run row for (jobId, scheduledStartAt).
     * If the row already exists (UNIQUE constraint), returns the existing id.
     * @returns {{ id: string, created: boolean }}
     */
    createRunIfNotExists({ jobId, scheduledStartAt }) {
      const id = randomUUID();
      try {
        db.prepare(
          `INSERT INTO recording_runs (id, job_id, scheduled_start_at) VALUES (?, ?, ?)`,
        ).run(id, jobId, scheduledStartAt);
        return { id, created: true };
      } catch (e) {
        if (e.message?.includes('UNIQUE')) {
          const row = db.prepare(
            `SELECT id FROM recording_runs WHERE job_id = ? AND scheduled_start_at = ?`,
          ).get(jobId, scheduledStartAt);
          return { id: row.id, created: false };
        }
        throw e;
      }
    },

    /**
     * Partial update — only the provided fields are written.
     * Keys must be valid column names (internal code only; no user input).
     */
    updateRun(id, fields) {
      const cols = Object.keys(fields);
      if (cols.length === 0) return;
      const setClause = cols.map((c) => `${c} = ?`).join(', ');
      db.prepare(`UPDATE recording_runs SET ${setClause} WHERE id = ?`)
        .run(...Object.values(fields), id);
    },

    /** Most-recent runs with denormalised station/program columns. */
    listRuns({ limit = 100 } = {}) {
      return db.prepare(
        `SELECT r.*, j.station, j.program, j.stream_url
         FROM recording_runs r
         JOIN recording_jobs j ON j.id = r.job_id
         ORDER BY r.scheduled_start_at DESC
         LIMIT ?`,
      ).all(limit);
    },

    getRunById(id) {
      return db.prepare(`SELECT * FROM recording_runs WHERE id = ?`).get(id);
    },
  };
}

function deserializeJob(row) {
  return { ...row, schedule: JSON.parse(row.schedule_json), enabled: Boolean(row.enabled) };
}
