import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  editionSelectionKey,
  editionsMatch,
  editionRunDiffersFromAnchor,
  formatEditionPickerTriggerParts,
  formatWindowDaysLabel,
  formatWindowRangeLabel,
  resolveActiveEdition,
  shouldLabelEditionRunTime,
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
    'report.edition.reportForShort': 'Report {date}',
    'report.edition.runAtShort': 'Run {time}',
    'report.edition.pickerShort': 'Choose report',
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

  it('resolveActiveEdition prefers loaded edition then selected edition', () => {
    const editions = [
      { date: '2026-04-10', run_id: '1800', assessment_days: 3 },
      { date: '2026-04-10', run_id: '0900', assessment_days: 3 },
    ];
    assert.deepEqual(resolveActiveEdition(editions[0], null, editions), editions[0]);
    assert.deepEqual(
      resolveActiveEdition(null, { date: '2026-04-10', run_id: '0900' }, editions),
      editions[1],
    );
    assert.deepEqual(resolveActiveEdition(null, null, editions), editions[0]);
  });

  it('editionsMatch compares date and run_id', () => {
    assert.equal(editionsMatch({ date: '2026-04-02', run_id: '0900' }, { date: '2026-04-02', run_id: '0900' }), true);
    assert.equal(editionsMatch({ date: '2026-04-02', run_id: null }, { date: '2026-04-02' }), true);
    assert.equal(editionsMatch({ date: '2026-04-02', run_id: '0900' }, { date: '2026-04-02', run_id: '1800' }), false);
    assert.equal(editionSelectionKey({ date: '2026-04-02', run_id: '0900' }), '2026-04-02:0900');
  });

  it('shouldLabelEditionRunTime when multiple runs or run date differs from report date', () => {
    assert.equal(
      shouldLabelEditionRunTime({ date: '2026-04-11', generated_at: '2026-06-14T17:59:00.000Z' }, 1),
      true,
    );
    assert.equal(
      shouldLabelEditionRunTime({ date: '2026-04-02', generated_at: '2026-04-02T09:15:00.000Z' }, 1),
      false,
    );
    assert.equal(editionRunDiffersFromAnchor({ date: '2026-04-11', generated_at: '2026-06-14T17:59:00.000Z' }), true);
  });

  it('formatEditionPickerTriggerParts returns a short closed-state label', () => {
    assert.deepEqual(
      formatEditionPickerTriggerParts(t, {
        date: '2026-04-10',
        window_start: '2026-04-08',
        window_end: '2026-04-10',
        assessment_days: 3,
        generated_at: '2026-06-14T17:59:00.000Z',
      }),
      ['Choose report'],
    );
  });
});
