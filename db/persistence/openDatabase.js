import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function busyTimeoutMs() {
  const n = Number.parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS ?? '5000', 10);
  return Number.isFinite(n) && n >= 0 ? n : 5000;
}

/**
 * Single opening point for app.sqlite connections. Every connection gets a
 * busy timeout so cross-process write overlap waits instead of failing with
 * SQLITE_BUSY immediately; read-write connections also get WAL.
 *
 * @param {string} dbPath
 * @param {{ readOnly?: boolean }} [opts]
 * @returns {import('node:sqlite').DatabaseSync}
 */
export function openAppDatabase(dbPath, opts = {}) {
  const readOnly = opts.readOnly === true;
  if (!readOnly && dbPath !== ':memory:') {
    try { mkdirSync(dirname(dbPath), { recursive: true }); } catch { /* exists */ }
  }
  const db = readOnly
    ? new DatabaseSync(dbPath, { readOnly: true })
    : new DatabaseSync(dbPath);
  try {
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs()}`);
  } catch { /* pragma unsupported — keep going */ }
  if (!readOnly && dbPath !== ':memory:') {
    try {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
    } catch { /* e.g. read-only filesystem — keep going */ }
  }
  return db;
}
