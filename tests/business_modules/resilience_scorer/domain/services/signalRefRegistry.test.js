import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatSignalWithRef } from '../../../../../business_modules/resilience_scorer/domain/services/narrative/signalRefRegistry.js';

const ENTRY = { label: 'S1', ref: 'x@idx:0' };

describe('formatSignalWithRef date line', () => {
  it('renders visit date with age for visits signals', () => {
    const line = formatSignalWithRef({
      signal_type: 'community_volunteering',
      evidence: 'volunteers active',
      signal_file_date: '2026-06-09',
      visit_date: '2026-05-29',
      signal_age_days: 12,
    }, ENTRY);
    assert.ok(line.includes('Field visit date: 2026-05-29 (12 days before report)'));
    assert.ok(!line.includes('Source bundle date'));
  });

  it('labels same-day visits as report day and 1-day-old as singular', () => {
    const sameDay = formatSignalWithRef({
      evidence: 'x', visit_date: '2026-06-10', signal_age_days: 0,
    }, ENTRY);
    assert.ok(sameDay.includes('Field visit date: 2026-06-10 (report day)'));
    const oneDay = formatSignalWithRef({
      evidence: 'x', visit_date: '2026-06-09', signal_age_days: 1,
    }, ENTRY);
    assert.ok(oneDay.includes('(1 day before report)'));
  });

  it('keeps the bundle-date line for non-visit signals', () => {
    const line = formatSignalWithRef({
      signal_type: 'fear_expression',
      evidence: 'reported fear',
      signal_file_date: '2026-06-10',
    }, ENTRY);
    assert.ok(line.includes('Source bundle date: 2026-06-10'));
    assert.ok(!line.includes('Field visit date'));
  });
});
