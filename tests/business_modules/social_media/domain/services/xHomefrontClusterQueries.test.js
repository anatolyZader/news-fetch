import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyXSearchSlots,
  buildHomefrontClusterQuery,
  isNorthRelevantText,
  assessmentWindowDates,
} from '../../../../../business_modules/social_media/domain/services/xHomefrontClusterQueries.js';

describe('xHomefrontClusterQueries', () => {
  it('buildHomefrontClusterQuery includes north locality when north=true', () => {
    const national = buildHomefrontClusterQuery({ lang: 'he', cluster: 'A', north: false });
    const north = buildHomefrontClusterQuery({ lang: 'he', cluster: 'A', north: true });
    assert.ok(national.includes('lang:he'));
    assert.ok(north.includes('נהריה'));
    assert.ok(north.length <= 512);
    assert.ok(!national.includes('נהריה') || national.length < north.length);
  });

  it('buildDailyXSearchSlots covers days × langs × clusters', () => {
    const slots = buildDailyXSearchSlots({
      anchorDate: '2026-05-23',
      days: 3,
      north: true,
      langs: ['he', 'ar'],
      clusters: ['A', 'B'],
    });
    assert.equal(slots.length, 3 * 2 * 2);
    assert.ok(slots.every((s) => s.query && s.startTime && s.endTime));
  });

  it('assessmentWindowDates returns anchor and prior days', () => {
    const dates = assessmentWindowDates('2026-05-23', 3);
    assert.deepEqual(dates, ['2026-05-23', '2026-05-22', '2026-05-21']);
  });

  it('isNorthRelevantText matches northern localities', () => {
    assert.equal(isNorthRelevantText('אזעקה בנהריה'), true);
    assert.equal(isNorthRelevantText('breaking news in tel aviv only'), false);
  });
});
