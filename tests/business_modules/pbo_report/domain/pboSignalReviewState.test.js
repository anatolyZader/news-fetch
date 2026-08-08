import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPboReviewStateMap,
  municipalityOfPboSignal,
  stampPboSignalReviewState,
} from '../../../../business_modules/pbo_report/domain/services/pboSignalReviewState.js';

const day = {
  date: '2026-04-01',
  municipalities: [{ name: 'אעבלין' }, { name: 'מגדל' }, { name: 'צפת' }],
};

describe('buildPboReviewStateMap', () => {
  it('defaults municipalities with no review row to unreviewed', () => {
    // The review store is sparse — a missing row is a coverage gap, not a verdict.
    const map = buildPboReviewStateMap(day, new Map());
    assert.equal(map.get('אעבלין'), 'unreviewed');
    assert.equal(map.size, 3);
  });

  it('carries through the reviewed states that do exist', () => {
    const map = buildPboReviewStateMap(day, new Map([
      ['אעבלין', { pbo_review_state: 'reviewed_incomplete' }],
      ['מגדל', { pbo_review_state: 'reviewed_sufficient' }],
    ]));
    assert.equal(map.get('אעבלין'), 'reviewed_incomplete');
    assert.equal(map.get('מגדל'), 'reviewed_sufficient');
    assert.equal(map.get('צפת'), 'unreviewed');
  });

  it('tolerates a day with no municipalities', () => {
    assert.equal(buildPboReviewStateMap({}, new Map()).size, 0);
    assert.equal(buildPboReviewStateMap(null).size, 0);
  });
});

describe('municipalityOfPboSignal', () => {
  it('prefers an explicit municipality field', () => {
    assert.equal(municipalityOfPboSignal({ municipality: 'צפת', article_source: 'pbo-מגדל' }), 'צפת');
  });

  it('falls back to the deterministic pbo- source prefix', () => {
    assert.equal(municipalityOfPboSignal({ article_source: 'pbo-מגדל' }), 'מגדל');
  });

  it('returns null for non-PBO sources', () => {
    assert.equal(municipalityOfPboSignal({ article_source: 'ynetnews.com' }), null);
    assert.equal(municipalityOfPboSignal({}), null);
  });
});

describe('stampPboSignalReviewState', () => {
  const stateByMuni = new Map([['אעבלין', 'reviewed_incomplete']]);

  it('stamps the state and backfills municipality from article_source', () => {
    const [out] = stampPboSignalReviewState(
      [{ signal_type: 'community_volunteering', article_source: 'pbo-אעבלין' }],
      stateByMuni,
    );
    assert.equal(out.pbo_review_state, 'reviewed_incomplete');
    assert.equal(out.municipality, 'אעבלין');
  });

  it('marks a municipality missing from the map as unreviewed', () => {
    const [out] = stampPboSignalReviewState([{ article_source: 'pbo-כרמיאל' }], stateByMuni);
    assert.equal(out.pbo_review_state, 'unreviewed');
    assert.equal(out.municipality, 'כרמיאל');
  });

  it('leaves non-PBO signals untouched', () => {
    const input = { signal_type: 'fear_expression', article_source: 'ynetnews.com' };
    const [out] = stampPboSignalReviewState([input], stateByMuni);
    assert.equal(out.pbo_review_state, undefined);
    assert.equal(out, input);
  });

  it('returns an empty array for non-array input', () => {
    assert.deepEqual(stampPboSignalReviewState(null, stateByMuni), []);
  });
});
