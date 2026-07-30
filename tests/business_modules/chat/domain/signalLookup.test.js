import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchSignals,
  formatSignals,
  loadSignals,
  listReportDates,
  listReportDatesByScope,
  listSignalMeta,
  listSignalDatesBySourceType,
  getSignalById,
  formatFullSignal,
} from '../../../../business_modules/chat/domain/signalLookup.js';

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
      signal_type: 'rumor_spread',
      source_type: 'news',
      date: '2026-03-21',
      evidence: 'Residents in Tel Aviv searched for alerts',
      signal_id: 'a#1',
    },
    {
      signal_type: 'information_confusion',
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

describe('searchSignals routing-derived component filter', () => {
  const signals = [
    { signal_type: 'compliance_enter_shelter', source_type: 'news', date: '2026-03-20', evidence: 'entered shelter', signal_id: 'a#1' },
    { signal_type: 'rumor_spread', source_type: 'news', date: '2026-03-21', evidence: 'rumor', signal_id: 'b#1' },
    { signal_type: 'not_in_catalog_xyz', source_type: 'news', date: '2026-03-22', evidence: 'noise', signal_id: 'c#1' },
  ];

  it('matches any catalog type routed to the component (no hardcoded map)', () => {
    const matches = searchSignals(signals, { component: 'lifesaving_behavior' });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].signal_id, 'a#1');
  });

  it('drops unknown types under a component filter', () => {
    const matches = searchSignals(signals, { component: 'information_communication' });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].signal_id, 'b#1');
  });

  it('orders results newest-first before applying limit', () => {
    const matches = searchSignals(signals, { limit: 2 });
    assert.deepEqual(matches.map((s) => s.signal_id), ['c#1', 'b#1']);
  });
});

describe('coverage listings', () => {
  it('listReportDatesByScope union equals listReportDates', () => {
    const byScope = listReportDatesByScope();
    const union = new Set(Object.values(byScope).flat());
    assert.deepEqual(
      [...union].sort((a, b) => a.localeCompare(b)),
      listReportDates(),
    );
    for (const dates of Object.values(byScope)) {
      assert.ok(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
    }
  });

  it('listSignalDatesBySourceType union equals listSignalMeta', () => {
    const byType = listSignalDatesBySourceType();
    const meta = listSignalMeta();
    assert.deepEqual(
      Object.keys(byType).sort((a, b) => a.localeCompare(b)),
      meta.sourceTypes,
    );
    const union = new Set(Object.values(byType).flat());
    assert.deepEqual(
      [...union].sort((a, b) => a.localeCompare(b)),
      meta.signalDates,
    );
  });
});

describe('getSignalById', () => {
  it('rejects malformed ids', () => {
    assert.match(getSignalById('nonsense').error, /Invalid signal_id format/);
    assert.match(getSignalById('').error, /Invalid signal_id format/);
  });

  it('reports a missing bundle file', () => {
    assert.match(getSignalById('signals-news-1999-01-01.json#1').error, /No signal bundle named/);
  });

  it('round-trips a real signal from loadSignals with full evidence', () => {
    const [first] = loadSignals({});
    if (!first) return; // no signal data on disk in this environment
    const { signal, error } = getSignalById(first.signal_id);
    assert.equal(error, undefined);
    assert.equal(signal.signal_type, first.signal_type);
    assert.equal(signal.evidence, first.evidence);
    const text = formatFullSignal(signal);
    assert.ok(text.includes(`id=${first.signal_id}`));
    assert.ok(text.includes(String(first.evidence ?? '')));
  });

  it('reports an out-of-range index', () => {
    const [first] = loadSignals({});
    if (!first) return;
    const file = first.signal_id.split('#')[0];
    assert.match(getSignalById(`${file}#99999`).error, /has only \d+ signals/);
  });
});
