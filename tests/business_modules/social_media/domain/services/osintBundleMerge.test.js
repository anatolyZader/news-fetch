import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeFindingsIntoBundle,
  isBundleFreshForRun,
  groupFindingsByDate,
  findingDateFromPostedAt,
  postToOsintFinding,
} from '../../../../../business_modules/social_media/domain/services/osintBundleMerge.js';

describe('osintBundleMerge', () => {
  it('findingDateFromPostedAt parses ISO and date prefixes', () => {
    assert.equal(findingDateFromPostedAt('2026-05-23T08:00:00Z'), '2026-05-23');
    assert.equal(findingDateFromPostedAt('2026-05-22'), '2026-05-22');
    assert.match(findingDateFromPostedAt(''), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('postToOsintFinding rejects news-domain URLs', () => {
    const wrapped = postToOsintFinding({
      id: 'x-news',
      platform: 'x',
      text: 'תושבים במקלט בנהריה אחרי האזעקה בצפון',
      url: 'https://www.ynet.co.il/article/123',
      postedAt: '2026-05-23T10:00:00Z',
    });
    assert.equal(wrapped.rejected, true);
    assert.equal(wrapped.reason, 'news_domain');
  });

  it('postToOsintFinding accepts citizen behavior quotes', () => {
    const wrapped = postToOsintFinding({
      id: 'x-citizen',
      platform: 'x',
      text: 'תושבים במקלט בנהריה אחרי האזעקה',
      url: 'https://x.com/a/2',
      postedAt: '2026-05-23T10:00:00Z',
    });
    assert.equal(wrapped.rejected, false);
    assert.equal(wrapped.finding.id, 'x-citizen');
  });

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
