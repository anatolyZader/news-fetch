import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupSessionsByRecency } from '../../../client/src/lib/chatSessionGroups.js';

describe('groupSessionsByRecency', () => {
  const today = '2026-07-25';

  it('buckets by today / this week / older with correct boundaries', () => {
    const sessions = [
      { id: 'a', report_date: '2026-07-25' },
      { id: 'b', report_date: '2026-07-19' }, // today-6 → this week
      { id: 'c', report_date: '2026-07-18' }, // today-7 → older
      { id: 'd', report_date: '2026-07-01' },
    ];
    const groups = groupSessionsByRecency(sessions, today);
    assert.deepEqual(groups.map((g) => g.key), ['today', 'thisWeek', 'older']);
    assert.deepEqual(groups[0].sessions.map((s) => s.id), ['a']);
    assert.deepEqual(groups[1].sessions.map((s) => s.id), ['b']);
    assert.deepEqual(groups[2].sessions.map((s) => s.id), ['c', 'd']);
  });

  it('omits empty groups and preserves input order', () => {
    const sessions = [
      { id: 'x', report_date: '2026-07-25' },
      { id: 'y', report_date: '2026-07-25' },
    ];
    const groups = groupSessionsByRecency(sessions, today);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].sessions.map((s) => s.id), ['x', 'y']);
  });

  it('handles empty input', () => {
    assert.deepEqual(groupSessionsByRecency([], today), []);
    assert.deepEqual(groupSessionsByRecency(null, today), []);
  });
});
