import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSignalFlagStore } from '../../../../business_modules/chat/infrastructure/signalFlagStore.js';

describe('signalFlagStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signal-flags-'));
  const store = createSignalFlagStore(dir);
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('append writes a dated JSONL file and returns the full entry', () => {
    const entry = store.append({
      user: 'op@test.com',
      signal_id: 'signals-news-2026-07-12.json#3',
      reason: 'wrong_type',
      note: 'looks like rumor_spread',
      session_id: 'sess-1',
    });
    const day = entry.flagged_at.slice(0, 10);
    assert.match(entry.flag_id, /^sf_\d{4}-\d{2}-\d{2}_[a-f0-9-]{8}$/);
    assert.equal(entry.reason, 'wrong_type');
    assert.equal(entry.source_ref, null);
    assert.ok(existsSync(join(dir, `signal-flags-${day}.jsonl`)));

    const listed = store.listForDate(day);
    assert.equal(listed.length, 1);
    assert.deepEqual(listed[0], entry);
  });

  it('flag ids are unique across appends', () => {
    const a = store.append({ user: 'op@test.com', source_ref: 'url-a', reason: 'other', note: 'x' });
    const b = store.append({ user: 'op@test.com', source_ref: 'url-b', reason: 'other', note: 'y' });
    assert.notEqual(a.flag_id, b.flag_id);
    const listed = store.listForDate(a.flagged_at.slice(0, 10));
    assert.equal(listed.length, 3);
  });

  it('listForDate returns [] for a date with no file', () => {
    assert.deepEqual(store.listForDate('1999-01-01'), []);
  });
});
