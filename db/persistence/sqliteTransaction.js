/**
 * Run a function inside a SQLite transaction (BEGIN / COMMIT / ROLLBACK).
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {() => void} fn
 */
export function runInTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  }
}
