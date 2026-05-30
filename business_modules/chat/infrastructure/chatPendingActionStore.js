/**
 * SQLite store for confirm-gated chat pending actions.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { PENDING_ACTION_TTL_MS } from '../domain/chatConfig.js';

const DDL = `
CREATE TABLE IF NOT EXISTS chat_pending_actions (
  id           TEXT PRIMARY KEY NOT NULL,
  owner_uid    TEXT NOT NULL,
  session_id   TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  params_json  TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  consumed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_pending_owner_session
  ON chat_pending_actions(owner_uid, session_id, consumed_at);
`;

export function createChatPendingActionStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  return {
    /**
     * @param {{ ownerUid: string, sessionId: string, toolName: string, params: object, summary: string }} row
     */
    createPending({ ownerUid, sessionId, toolName, params, summary }) {
      const id = randomUUID();
      const expiresAt = new Date(Date.now() + PENDING_ACTION_TTL_MS).toISOString();
      db.prepare(`
        INSERT INTO chat_pending_actions (id, owner_uid, session_id, tool_name, params_json, summary, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        ownerUid,
        sessionId,
        toolName,
        JSON.stringify(params ?? {}),
        String(summary ?? '').slice(0, 2000),
        expiresAt,
      );
      return { id, expiresAt };
    },

    getPending(id) {
      const row = db.prepare(`
        SELECT id, owner_uid, session_id, tool_name, params_json, summary, created_at, expires_at, consumed_at
        FROM chat_pending_actions WHERE id = ?
      `).get(id);
      if (!row) return null;
      let params = {};
      try {
        params = JSON.parse(row.params_json);
      } catch {
        params = {};
      }
      return {
        id: row.id,
        ownerUid: row.owner_uid,
        sessionId: row.session_id,
        toolName: row.tool_name,
        params,
        summary: row.summary,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
      };
    },

    markConsumed(id) {
      db.prepare(`
        UPDATE chat_pending_actions SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL
      `).run(id);
    },

    isExpired(pending) {
      if (!pending?.expiresAt) return true;
      return Date.now() > new Date(pending.expiresAt).getTime();
    },
  };
}
