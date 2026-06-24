import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatWindowDaysLabel,
  formatWindowRangeLabel,
  resolveActiveEdition,
} from '../../../client/src/lib/reportEditionFormat.js';

const t = (key) => {
  const map = {
    'report.edition.windowDays': '{n}-day window',
    'report.edition.windowSingle': '1-day window',
    'report.edition.windowUnknown': 'Window unknown',
    'report.edition.windowUnknownHint': 'Signal window not recorded',
    'report.edition.includesSignals': 'Includes signals {start}–{end} ({days} days)',
    'report.edition.includesSingleDay': 'Includes signals for {date} only',
    'report.edition.signalsShort': 'signals {start}–{end}',
    'report.edition.signalsShortSingle': 'signals {date}',
  };
  return map[key] ?? key;
};

describe('reportEditionFormat', () => {
  it('formatWindowDaysLabel handles known and unknown windows', () => {
    assert.equal(formatWindowDaysLabel(t, 3), '3-day window');
    assert.equal(formatWindowDaysLabel(t, 1), '1-day window');
    assert.equal(formatWindowDaysLabel(t, null), 'Window unknown');
  });

  it('formatWindowRangeLabel formats multi-day and single-day ranges', () => {
    assert.equal(
      formatWindowRangeLabel(t, {
        window_start: '2026-04-08',
        window_end: '2026-04-10',
        assessment_days: 3,
      }),
      'Includes signals 08.04.2026–10.04.2026 (3 days)',
    );
    assert.equal(
      formatWindowRangeLabel(t, { date: '2026-04-10', window_end: '2026-04-10', assessment_days: 1 }),
      'Includes signals for 10.04.2026 only',
    );
  });

  it('resolveActiveEdition prefers loaded edition then selected date', () => {
    const editions = [{ date: '2026-04-10', assessment_days: 3 }];
    assert.deepEqual(resolveActiveEdition(editions[0], null, editions), editions[0]);
    assert.deepEqual(resolveActiveEdition(null, '2026-04-10', editions), editions[0]);
    assert.deepEqual(resolveActiveEdition(null, null, editions), editions[0]);
  });
});
