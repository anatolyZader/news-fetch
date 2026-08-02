import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTourProgressStore } from '../../../../business_modules/product_tour/infrastructure/tourProgressStore.js';

test('tourProgressStore upsert/get roundtrip and conflict update', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tour-progress-'));
  try {
    const dbPath = join(dir, 'test.sqlite');
    const store = createTourProgressStore(dbPath);
    assert.equal(store.getByUid('u1', 'main-shell'), null);

    const saved = store.upsert({
      userUid: 'u1',
      tourId: 'main-shell',
      status: 'in_progress',
      lastStepIndex: 4,
      seenVersion: 1,
    });
    assert.equal(saved.status, 'in_progress');
    assert.equal(saved.lastStepIndex, 4);
    assert.equal(saved.seenVersion, 1);
    assert.equal(saved.completedAt, null);

    const updated = store.upsert({
      userUid: 'u1',
      tourId: 'main-shell',
      status: 'completed',
      lastStepIndex: 9,
      seenVersion: 1,
    });
    assert.equal(updated.status, 'completed');
    assert.equal(updated.lastStepIndex, 9);
    assert.ok(updated.completedAt, 'completed_at is stamped on completion');

    const reopened = store.upsert({
      userUid: 'u1',
      tourId: 'main-shell',
      status: 'in_progress',
      lastStepIndex: 0,
      seenVersion: 2,
    });
    assert.equal(reopened.completedAt, null, 'completed_at cleared when reopened');
    assert.equal(reopened.seenVersion, 2);

    assert.equal(store.getByUid('u2', 'main-shell'), null, 'progress is per uid');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tourProgressStore rejects empty uid or tourId', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tour-progress-'));
  try {
    const store = createTourProgressStore(join(dir, 'test.sqlite'));
    assert.throws(() => store.upsert({ userUid: '', tourId: 'main-shell', status: 'in_progress' }));
    assert.throws(() => store.upsert({ userUid: 'u1', tourId: '', status: 'in_progress' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
