/**
 * SQLite persistence for WhatsApp report drafts.
 * Adaptive elicitation accumulates a structured report across turns:
 *   - structured_state: JSON blob {observation, interpretation, componentLinks, confidence}
 *   - turn_history:     JSON array of {role:'officer'|'bot', text, ts}
 *   - approved_draft:   the Hebrew prose draft the officer approved at submit
 *
 * Legacy flat fields (location, description, scope, evidence_text) are kept for
 * backward-compat reads but are no longer written by the new flow.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAppDatabase } from '../../../db/persistence/openDatabase.js';
import { randomUUID } from 'node:crypto';

const DDL = `
CREATE TABLE IF NOT EXISTS whatsapp_report_drafts (
  id              TEXT    PRIMARY KEY,
  phone_number    TEXT    NOT NULL,
  location        TEXT,
  description     TEXT,
  scope           TEXT,
  evidence_text   TEXT,
  structured_state TEXT,
  turn_history     TEXT,
  approved_draft   TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wa_drafts_phone ON whatsapp_report_drafts(phone_number);
`;

// Columns that may be missing on existing databases — add idempotently.
const MIGRATIONS = [
  { col: 'structured_state', ddl: 'ALTER TABLE whatsapp_report_drafts ADD COLUMN structured_state TEXT' },
  { col: 'turn_history',     ddl: 'ALTER TABLE whatsapp_report_drafts ADD COLUMN turn_history TEXT' },
  { col: 'approved_draft',   ddl: 'ALTER TABLE whatsapp_report_drafts ADD COLUMN approved_draft TEXT' },
];

const UPDATABLE_FIELDS = new Set(['location', 'description', 'scope', 'evidence_text']);

function applyMigrations(db) {
  const cols = new Set(
    db.prepare(`PRAGMA table_info(whatsapp_report_drafts)`).all().map((r) => r.name),
  );
  for (const { col, ddl } of MIGRATIONS) {
    if (!cols.has(col)) db.exec(ddl);
  }
}

function safeJsonParse(text, fallback) {
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function hydrateWhatsAppReportDraftRow(row) {
  if (!row) return null;
  return {
    ...row,
    structured_state: safeJsonParse(row.structured_state, {}),
    turn_history: safeJsonParse(row.turn_history, []),
  };
}

/**
 * @param {string} dbPath  Absolute path to SQLite file
 */
export function createWhatsAppReportDraftStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAppDatabase(dbPath);
  db.exec(DDL);
  applyMigrations(db);

  const insertStmt = db.prepare(`
    INSERT INTO whatsapp_report_drafts (id, phone_number, structured_state, turn_history)
    VALUES (?, ?, '{}', '[]')
  `);

  const getStmt = db.prepare(
    `SELECT * FROM whatsapp_report_drafts WHERE id = ?`,
  );

  const getActiveStmt = db.prepare(
    `SELECT * FROM whatsapp_report_drafts WHERE phone_number = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1`,
  );

  const updateFieldStmts = {};
  for (const field of UPDATABLE_FIELDS) {
    updateFieldStmts[field] = db.prepare(
      `UPDATE whatsapp_report_drafts SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`,
    );
  }

  const updateStructuredStmt = db.prepare(
    `UPDATE whatsapp_report_drafts SET structured_state = ?, updated_at = datetime('now') WHERE id = ?`,
  );

  const updateTurnHistoryStmt = db.prepare(
    `UPDATE whatsapp_report_drafts SET turn_history = ?, updated_at = datetime('now') WHERE id = ?`,
  );

  const updateApprovedDraftStmt = db.prepare(
    `UPDATE whatsapp_report_drafts SET approved_draft = ?, updated_at = datetime('now') WHERE id = ?`,
  );

  const markSubmittedStmt = db.prepare(
    `UPDATE whatsapp_report_drafts SET status = 'submitted', updated_at = datetime('now') WHERE id = ?`,
  );

  const deleteStmt = db.prepare(
    `DELETE FROM whatsapp_report_drafts WHERE id = ?`,
  );

  return {
    /** Create a new draft. @returns {string} the draft id */
    create(phoneNumber) {
      const id = randomUUID();
      insertStmt.run(id, phoneNumber);
      return id;
    },

    get(id) {
      return hydrateWhatsAppReportDraftRow(getStmt.get(id) ?? null);
    },

    getActiveDraft(phoneNumber) {
      return hydrateWhatsAppReportDraftRow(getActiveStmt.get(phoneNumber) ?? null);
    },

    /**
     * Update a single legacy field on a draft (kept for group-flow / migration compatibility).
     * @param {string} id
     * @param {'location'|'description'|'scope'|'evidence_text'} field
     * @param {string} value
     */
    updateField(id, field, value) {
      const stmt = updateFieldStmts[field];
      if (!stmt) throw new Error(`Invalid draft field: ${field}`);
      stmt.run(value, id);
    },

    /** Replace the full structured_state object. */
    updateStructured(id, structuredState) {
      updateStructuredStmt.run(JSON.stringify(structuredState ?? {}), id);
    },

    /** Append one turn {role, text, ts} to turn_history. */
    appendTurn(id, turn) {
      const row = getStmt.get(id);
      const history = safeJsonParse(row?.turn_history, []);
      history.push(turn);
      updateTurnHistoryStmt.run(JSON.stringify(history), id);
    },

    /** Replace the whole turn history (rare). */
    setTurnHistory(id, history) {
      updateTurnHistoryStmt.run(JSON.stringify(history ?? []), id);
    },

    /** Record the Hebrew prose draft shown to the officer (before approval). */
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
