import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { openAppDatabase } from '../../../db/persistence/openDatabase.js';
import { runInTransaction } from '../../../db/persistence/sqliteTransaction.js';

const dir = mkdtempSync(join(tmpdir(), 'opendb-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('openAppDatabase', () => {
  it('applies busy_timeout and WAL on read-write connections', () => {
    const db = openAppDatabase(join(dir, 'a.sqlite'));
    const { timeout } = db.prepare('PRAGMA busy_timeout').get();
    assert.equal(timeout, 5000);
    const { journal_mode } = db.prepare('PRAGMA journal_mode').get();
    assert.equal(journal_mode, 'wal');
    db.close();
  });

  it('creates the parent directory when missing', () => {
    const db = openAppDatabase(join(dir, 'nested', 'deep', 'b.sqlite'));
    db.exec('CREATE TABLE t (id INTEGER)');
    db.close();
  });

  it('read-only connections reject writes', () => {
    const rw = openAppDatabase(join(dir, 'c.sqlite'));
    rw.exec('CREATE TABLE t (id INTEGER)');
    rw.close();
    const ro = openAppDatabase(join(dir, 'c.sqlite'), { readOnly: true });
    assert.throws(() => ro.exec('INSERT INTO t VALUES (1)'));
    ro.close();
  });
});

describe('runInTransaction IMMEDIATE mode', () => {
  it('commits work and defaults to BEGIN IMMEDIATE', () => {
    const db = openAppDatabase(join(dir, 'tx.sqlite'));
    db.exec('CREATE TABLE t (id INTEGER)');
    runInTransaction(db, () => {
      db.prepare('INSERT INTO t VALUES (?)').run(1);
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM t').get().n, 1);
    db.close();
  });

  it('a second writer waits instead of failing immediately (busy_timeout)', () => {
    const path = join(dir, 'contend.sqlite');
    const a = openAppDatabase(path);
    a.exec('CREATE TABLE t (id INTEGER)');
    const b = openAppDatabase(path);
    // Zero timeout on b makes the contention visible without waiting 5s.
    b.exec('PRAGMA busy_timeout = 0');
    a.exec('BEGIN IMMEDIATE');
    assert.throws(() => b.exec('BEGIN IMMEDIATE'), /locked|busy/i);
    a.exec('ROLLBACK');
    b.exec('BEGIN IMMEDIATE');
    b.exec('ROLLBACK');
    a.close();
    b.close();
  });

  it('rolls back on error', () => {
    const db = openAppDatabase(join(dir, 'rb.sqlite'));
    db.exec('CREATE TABLE t (id INTEGER)');
    assert.throws(() => runInTransaction(db, () => {
      db.prepare('INSERT INTO t VALUES (?)').run(2);
      throw new Error('boom');
    }), /boom/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM t').get().n, 0);
    db.close();
  });
});
