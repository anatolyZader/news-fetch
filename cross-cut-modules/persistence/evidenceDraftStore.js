/**
 * SQLite persistence for user evidence drafts (Node built-in node:sqlite).
 * @see https://nodejs.org/api/sqlite.html
 */
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS evidence_drafts (
  owner_key TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * @param {string} dbPath Absolute path to SQLite file (parent dirs created if needed)
 */
export function createEvidenceDraftStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    /* ignore if unsupported */
  }

  const getStmt = db.prepare('SELECT content, updated_at FROM evidence_drafts WHERE owner_key = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO evidence_drafts (owner_key, content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(owner_key) DO UPDATE SET
      content = excluded.content,
      updated_at = datetime('now')
  `);

  return {
    /**
     * @param {string} ownerKey
     * @returns {{ content: string, updatedAt: string | null }}
     */
    get(ownerKey) {
      const row = getStmt.get(ownerKey);
      if (!row) return { content: '', updatedAt: null };
      return {
        content: typeof row.content === 'string' ? row.content : '',
        updatedAt: row.updated_at != null ? String(row.updated_at) : null,
      };
    },

    /**
     * @param {string} ownerKey
     * @param {string} content
     * @returns {{ content: string, updatedAt: string | null }}
     */
    save(ownerKey, content) {
      upsertStmt.run(ownerKey, content);
      const row = getStmt.get(ownerKey);
      return {
        content: typeof row?.content === 'string' ? row.content : '',
        updatedAt: row?.updated_at != null ? String(row.updated_at) : null,
      };
    },
  };
}
