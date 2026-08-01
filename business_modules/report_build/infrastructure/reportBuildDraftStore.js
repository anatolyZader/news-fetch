/**
 * SQLite persistence for report-build drafts (web).
 *
 * Stores:
 * - structured_state: JSON blob {observation, interpretation, componentLinks, confidence}
 * - turn_history: JSON array of {role:'officer'|'bot', text, ts}
 * - approved_draft: the Hebrew prose draft shown/approved by user
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAppDatabase } from '../../../db/persistence/openDatabase.js';
import { randomUUID } from 'node:crypto';

const DDL = `
CREATE TABLE IF NOT EXISTS report_build_drafts (
  id              TEXT    PRIMARY KEY,
  owner_key       TEXT    NOT NULL,
  structured_state TEXT,
  turn_history     TEXT,
  approved_draft   TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_report_build_drafts_owner ON report_build_drafts(owner_key);
`;

function safeJsonParse(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function hydrateReportBuildDraftRow(row) {
  if (!row) return null;
  return {
    ...row,
    structured_state: safeJsonParse(row.structured_state, {}),
    turn_history: safeJsonParse(row.turn_history, []),
  };
}

/**
 * @param {string} dbPath Absolute path to SQLite file
 */
export function createReportBuildDraftStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAppDatabase(dbPath);
  db.exec(DDL);

  const insertStmt = db.prepare(`
    INSERT INTO report_build_drafts (id, owner_key, structured_state, turn_history)
    VALUES (?, ?, '{}', '[]')
  `);

  const getStmt = db.prepare(`SELECT * FROM report_build_drafts WHERE id = ?`);

  const updateStructuredStmt = db.prepare(
    `UPDATE report_build_drafts SET structured_state = ?, updated_at = datetime('now') WHERE id = ?`,
  );

  const updateTurnHistoryStmt = db.prepare(
    `UPDATE report_build_drafts SET turn_history = ?, updated_at = datetime('now') WHERE id = ?`,
  );

  const updateApprovedDraftStmt = db.prepare(
    `UPDATE report_build_drafts SET approved_draft = ?, updated_at = datetime('now') WHERE id = ?`,
  );

  const markSubmittedStmt = db.prepare(
    `UPDATE report_build_drafts SET status = 'submitted', updated_at = datetime('now') WHERE id = ?`,
  );

  const deleteStmt = db.prepare(`DELETE FROM report_build_drafts WHERE id = ?`);

  return {
    create(ownerKey) {
      const id = randomUUID();
      insertStmt.run(id, ownerKey);
      return id;
    },
    get(id) {
      return hydrateReportBuildDraftRow(getStmt.get(id) ?? null);
    },
    updateStructured(id, structuredState) {
      updateStructuredStmt.run(JSON.stringify(structuredState ?? {}), id);
    },
    appendTurn(id, turn) {
      const row = getStmt.get(id);
      const history = safeJsonParse(row?.turn_history, []);
      history.push(turn);
      updateTurnHistoryStmt.run(JSON.stringify(history), id);
    },
    setApprovedDraft(id, draftText) {
      updateApprovedDraftStmt.run(draftText ?? '', id);
    },
    markSubmitted(id) {
      markSubmittedStmt.run(id);
    },
    deleteById(id) {
      deleteStmt.run(id);
    },
  };
}

