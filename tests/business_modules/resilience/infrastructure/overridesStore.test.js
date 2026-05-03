import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createOverridesStore } from '../../../../business_modules/resilience/infrastructure/overridesStore.js';

let tmp;
let store;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'overrides-test-'));
  store = createOverridesStore({ baseDir: tmp });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('overridesStore', () => {
  it('appends a record with id + created_at and persists JSONL', () => {
    const rec = store.append({
      uid: 'u1',
      report_date: '2026-05-03',
      scope: 'national',
      component_id: 'narrative',
      kind: 'challenge_score',
      proposed: { score: 4 },
      original: { score: 7 },
      note: 'thin evidence',
    });

    assert.ok(rec.id, 'append should populate id');
    assert.ok(rec.created_at, 'append should populate created_at');

    const filePath = resolve(tmp, '2026-05-03.jsonl');
    assert.ok(existsSync(filePath), 'jsonl file should be written');
    const written = readFileSync(filePath, 'utf8').trim().split('\n');
    assert.equal(written.length, 1);
    const parsed = JSON.parse(written[0]);
    assert.equal(parsed.id, rec.id);
    assert.equal(parsed.uid, 'u1');
    assert.equal(parsed.kind, 'challenge_score');
    assert.equal(parsed.proposed.score, 4);
  });

  it('append + listForDate round-trips multiple records', () => {
    store.append({ uid: 'u1', report_date: '2026-05-03', scope: 'national',
      component_id: 'narrative', kind: 'challenge_score',
      proposed: { score: 3 }, original: { score: 7 } });
    store.append({ uid: 'u2', report_date: '2026-05-03', scope: 'national',
      component_id: 'leadership', kind: 'flag_signal' });
    store.append({ uid: 'u3', report_date: '2026-05-03', scope: 'north',
      component_id: 'narrative', kind: 'challenge_score', proposed: { score: 6 } });

    const all = store.listForDate('2026-05-03');
    assert.equal(all.length, 3);

    const nationalOnly = store.listForDate('2026-05-03', { scope: 'national' });
    assert.equal(nationalOnly.length, 2);

    const northOnly = store.listForDate('2026-05-03', { scope: 'north' });
    assert.equal(northOnly.length, 1);
    assert.equal(northOnly[0].uid, 'u3');
  });

  it('countByComponent groups by component_id', () => {
    store.append({ uid: 'u1', report_date: '2026-05-03', scope: 'national',
      component_id: 'narrative', kind: 'challenge_score', proposed: { score: 5 } });
    store.append({ uid: 'u2', report_date: '2026-05-03', scope: 'national',
      component_id: 'narrative', kind: 'flag_signal' });
    store.append({ uid: 'u3', report_date: '2026-05-03', scope: 'national',
      component_id: 'leadership', kind: 'flag_signal' });

    const counts = store.countByComponent('2026-05-03');
    assert.equal(counts.narrative, 2);
    assert.equal(counts.leadership, 1);
  });

  it('returns empty list for missing dates', () => {
    assert.deepEqual(store.listForDate('2099-01-01'), []);
    assert.deepEqual(store.countByComponent('2099-01-01'), {});
  });

  it('skips malformed lines without throwing', () => {
    store.append({ uid: 'u1', report_date: '2026-05-03', scope: 'national',
      component_id: 'narrative', kind: 'challenge_score', proposed: { score: 5 } });
    // Manually corrupt by appending garbage line
    const fp = resolve(tmp, '2026-05-03.jsonl');
    const f = readFileSync(fp, 'utf8');
    writeFileSync(fp, f + 'not-json{}\n', 'utf8');
    const all = store.listForDate('2026-05-03');
    assert.equal(all.length, 1, 'malformed line should be skipped');
  });
});
