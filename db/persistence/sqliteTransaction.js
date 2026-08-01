/**
 * Run a function inside a SQLite transaction (BEGIN / COMMIT / ROLLBACK).
 * Defaults to BEGIN IMMEDIATE: with busy_timeout set, contention becomes a
 * bounded wait at BEGIN instead of SQLITE_BUSY at commit.
 * SQLITE_TX_MODE=deferred reverts to the old behavior.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {() => void} fn
 */
export function runInTransaction(db, fn) {
  const deferred = (process.env.SQLITE_TX_MODE ?? '').trim().toLowerCase() === 'deferred';
  db.exec(deferred ? 'BEGIN' : 'BEGIN IMMEDIATE');
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
