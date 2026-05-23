import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeFindingsIntoBundle,
  isBundleFreshForRun,
  groupFindingsByDate,
} from '../../../../../business_modules/social_media/domain/services/osintBundleMerge.js';

describe('osintBundleMerge', () => {
  it('mergeFindingsIntoBundle dedupes by id', () => {
    const bundle = {
      date: '2026-05-23',
      findings: [{ id: 'x-1', quote_original: 'תושבים במקלט בנהריה', platform: 'x' }],
      rejected: {},
      rejected_examples: [],
    };
    const merged = mergeFindingsIntoBundle(bundle, [
      { id: 'x-1', quote_original: 'updated text תושבים במקלט', platform: 'x', date: '2026-05-23' },
      { id: 'x-2', quote_original: 'פחד מתושבים בצפון', platform: 'x', date: '2026-05-23' },
    ]);
    assert.equal(merged.findings.length, 2);
    assert.equal(merged.findings.find((f) => f.id === 'x-1').quote_original, 'updated text תושבים במקלט');
  });

  it('isBundleFreshForRun compares Jerusalem calendar day', () => {
    const bundle = { extracted_at: new Date().toISOString() };
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    assert.equal(isBundleFreshForRun(bundle, today), true);
    assert.equal(isBundleFreshForRun(bundle, '2020-01-01'), false);
  });

  it('groupFindingsByDate buckets findings', () => {
    const map = groupFindingsByDate([
      { id: 'a', date: '2026-05-22' },
      { id: 'b', date: '2026-05-23' },
    ]);
    assert.equal(map.get('2026-05-22')?.length, 1);
    assert.equal(map.get('2026-05-23')?.length, 1);
  });
});
