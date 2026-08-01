/**
 * SQLite persistence for web chat sessions + messages.
 * Uses node:sqlite (same pattern as evidenceStore, whatsapp stores, etc.).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openAppDatabase } from '../../../db/persistence/openDatabase.js';

const DDL = `
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          TEXT PRIMARY KEY NOT NULL,
  owner_uid   TEXT NOT NULL,
  report_date TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner_date
  ON chat_sessions(owner_uid, report_date, updated_at);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner_updated
  ON chat_sessions(owner_uid, updated_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY NOT NULL,
  session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content     TEXT NOT NULL DEFAULT '',
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  meta_json   TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON chat_messages(session_id, created_at);
`;

export function createChatStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAppDatabase(dbPath);
  db.exec(DDL);
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch { /* ignore */ }
  try { db.exec('PRAGMA foreign_keys = ON;'); } catch { /* ignore */ }
  // Additive migration: rolling conversation summary (fails silently when the
  // columns already exist — same pattern as other node:sqlite stores).
  try { db.exec("ALTER TABLE chat_sessions ADD COLUMN summary TEXT NOT NULL DEFAULT ''"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE chat_sessions ADD COLUMN summary_through_id TEXT NOT NULL DEFAULT ''"); } catch { /* exists */ }

  const listSessionsStmt = db.prepare(`
    SELECT
      s.id,
      s.report_date,
      s.title,
      s.created_at,
      s.updated_at,
      (
        SELECT COUNT(*)
        FROM chat_messages m
        WHERE m.session_id = s.id AND m.hidden = 0 AND m.role IN ('user','assistant')
      ) AS message_count
    FROM chat_sessions s
    WHERE s.owner_uid = ? AND s.report_date = ?
    ORDER BY s.updated_at DESC
  `);

  const listRecentSessionsStmt = db.prepare(`
    SELECT
      s.id,
      s.report_date,
      s.title,
      s.created_at,
      s.updated_at,
      (
        SELECT COUNT(*)
        FROM chat_messages m
        WHERE m.session_id = s.id AND m.hidden = 0 AND m.role IN ('user','assistant')
      ) AS message_count
    FROM chat_sessions s
    WHERE s.owner_uid = ?
    ORDER BY s.updated_at DESC
    LIMIT ?
  `);

  const getSessionStmt = db.prepare(`
    SELECT id, owner_uid, report_date, title, created_at, updated_at, summary, summary_through_id
    FROM chat_sessions
    WHERE id = ?
    LIMIT 1
  `);

  const updateSessionSummaryStmt = db.prepare(`
    UPDATE chat_sessions
    SET summary = ?, summary_through_id = ?
    WHERE id = ? AND owner_uid = ?
  `);

  const createSessionStmt = db.prepare(`
    INSERT INTO chat_sessions (id, owner_uid, report_date, title)
    VALUES (?, ?, ?, ?)
  `);

  const renameSessionStmt = db.prepare(`
    UPDATE chat_sessions
    SET title = ?, updated_at = datetime('now')
    WHERE id = ? AND owner_uid = ?
  `);

  const touchSessionStmt = db.prepare(`
    UPDATE chat_sessions SET updated_at = datetime('now')
    WHERE id = ? AND owner_uid = ?
  `);

  const deleteSessionStmt = db.prepare(`
    DELETE FROM chat_sessions WHERE id = ? AND owner_uid = ?
  `);

  const listMessagesStmt = db.prepare(`
    SELECT id, role, content, created_at, meta_json
    FROM chat_messages
    WHERE session_id = ? AND hidden = 0
    ORDER BY created_at ASC
  `);

  const insertMessageStmt = db.prepare(`
    INSERT INTO chat_messages (id, session_id, role, content, meta_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  return {
    listSessions({ ownerUid, reportDate }) {
      return listSessionsStmt.all(ownerUid, reportDate);
    },

    listRecentSessions({ ownerUid, limit = 50 }) {
      const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
      return listRecentSessionsStmt.all(ownerUid, n);
    },

    getSession(id) {
      return getSessionStmt.get(id) ?? null;
    },

    createSession({ ownerUid, reportDate, title }) {
      const id = randomUUID();
      createSessionStmt.run(id, ownerUid, reportDate, String(title ?? '').trim());
      return id;
    },

    renameSession({ ownerUid, sessionId, title }) {
      const result = renameSessionStmt.run(String(title ?? '').trim(), sessionId, ownerUid);
      return (result.changes ?? 0) > 0;
    },

    touchSession({ ownerUid, sessionId }) {
      touchSessionStmt.run(sessionId, ownerUid);
    },

    /** Persist the rolling summary and the id of the last message it covers. */
    updateSessionSummary({ ownerUid, sessionId, summary, throughId }) {
      const result = updateSessionSummaryStmt.run(
        String(summary ?? ''),
        String(throughId ?? ''),
        sessionId,
        ownerUid,
      );
      return (result.changes ?? 0) > 0;
    },

    deleteSession({ ownerUid, sessionId }) {
      const result = deleteSessionStmt.run(sessionId, ownerUid);
      return (result.changes ?? 0) > 0;
    },

    listMessages({ sessionId }) {
      return listMessagesStmt.all(sessionId).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        meta: m.meta_json ? safeJsonParse(m.meta_json) : null,
      }));
    },

    addMessage({ sessionId, role, content, meta }) {
      const id = randomUUID();
      insertMessageStmt.run(
        id,
        sessionId,
        role,
        String(content ?? ''),
        meta ? JSON.stringify(meta) : null,
      );
      return id;
    },

    /**
     * Soft-delete a message and everything after it (edit-and-resubmit).
     * Returns the number of messages hidden; 0 when the id is unknown.
     */
    hideMessagesFrom({ sessionId, messageId }) {
      // rowid keeps insertion order; created_at only has second resolution and
      // a user+assistant pair regularly lands in the same second.
      const result = db.prepare(`
        UPDATE chat_messages SET hidden = 1
        WHERE session_id = ? AND hidden = 0
          AND rowid >= (
            SELECT rowid FROM chat_messages
            WHERE id = ? AND session_id = ? AND hidden = 0
          )
      `).run(sessionId, messageId, sessionId);
      return result.changes ?? 0;
    },

    getFirstUserMessage({ sessionId }) {
      const row = db.prepare(`
        SELECT content
        FROM chat_messages
        WHERE session_id = ? AND hidden = 0 AND role = 'user'
        ORDER BY created_at ASC
        LIMIT 1
      `).get(sessionId);
      return row?.content ?? null;
    },
  };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

