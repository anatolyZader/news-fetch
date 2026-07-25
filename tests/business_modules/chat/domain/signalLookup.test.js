import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { searchSignals, formatSignals } from '../../../../business_modules/chat/domain/signalLookup.js';

describe('searchSignals signal_type filter', () => {
  const signals = [
    { signal_type: 'compliance_enter_shelter', source_type: 'news', evidence: 'entered shelter' },
    { signal_type: 'mutual_aid', source_type: 'news', evidence: 'neighbors helped' },
    { signal_type: 'compliance_enter_shelter', source_type: 'radio', evidence: 'sprint to safe room' },
  ];

  it('filters by exact catalog type', () => {
    const matches = searchSignals(signals, { signalType: 'compliance_enter_shelter' });
    assert.equal(matches.length, 2);
    assert.ok(matches.every((s) => s.signal_type === 'compliance_enter_shelter'));
  });

  it('composes with source_type', () => {
    const matches = searchSignals(signals, { signalType: 'compliance_enter_shelter', sourceType: 'radio' });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].evidence, 'sprint to safe room');
  });
});

describe('signalLookup hardened municipality', () => {
  const signals = [
    {
      signal_type: 'information_seeking',
      source_type: 'news',
      date: '2026-03-21',
      evidence: 'Residents in Tel Aviv searched for alerts',
      signal_id: 'a#1',
    },
    {
      signal_type: 'information_sharing',
      source_type: 'news',
      date: '2026-03-22',
      evidence: 'Municipal update',
      geo: { canonicalKey: 'kiryat_shmona', matchedName: 'קריית שמונה' },
      signal_id: 'b#1',
    },
  ];

  it('filters by geo municipality', () => {
    const matches = searchSignals(signals, {
      component: 'information_communication',
      municipality: 'Kiryat Shmona',
      limit: 10,
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].signal_id, 'b#1');
  });

  it('formatSignals groups by date', () => {
    const text = formatSignals(signals, { groupBy: 'date' });
    assert.match(text, /### 2026-03-21/);
    assert.match(text, /### 2026-03-22/);
  });

  it('formatSignalLine uses extracted_at when present', () => {
    const text = formatSignals([{
      signal_type: 'information_seeking',
      source_type: 'news',
      date: '2026-03-21',
      extracted_at: '2026-03-21T08:30:00.000Z',
      evidence: 'test',
      signal_id: 'x#1',
    }]);
    assert.match(text, /2026-03-21 \d{2}:\d{2}/);
  });
});
