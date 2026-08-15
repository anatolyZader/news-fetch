import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isPboSignal,
  pboDatesInSignals,
  pboMunicipalityOf,
  resolvePboReviewStates,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/pboReviewStateResolution.js';

function pboSignal(over = {}) {
  return {
    source_type: 'pbo',
    signal_type: 'leadership_visible_presence',
    article_source: 'pbo-צפת',
    signal_file_date: '2026-04-02',
    pbo_review_state: 'unreviewed',
    ...over,
  };
}

describe('pboMunicipalityOf', () => {
  it('prefers the explicit municipality field', () => {
    assert.equal(pboMunicipalityOf({ municipality: 'ראמה', article_source: 'pbo-צפת' }), 'ראמה');
  });

  it('parses the deterministic pbo-<name> unit id, including Hebrew names', () => {
    assert.equal(pboMunicipalityOf({ article_source: 'pbo-צפת' }), 'צפת');
    assert.equal(pboMunicipalityOf({ article_source: "pbo-ג'ש (גוש חלב)" }), "ג'ש (גוש חלב)");
  });

  it('returns null for a non-PBO source', () => {
    assert.equal(pboMunicipalityOf({ article_source: 'ynet.co.il' }), null);
    assert.equal(pboMunicipalityOf({}), null);
  });
});

describe('isPboSignal / pboDatesInSignals', () => {
  it('recognises pbo and pbo_regional', () => {
    assert.equal(isPboSignal(pboSignal()), true);
    assert.equal(isPboSignal(pboSignal({ source_type: 'pbo_regional' })), true);
    assert.equal(isPboSignal({ source_type: 'news', article_source: 'ynet.co.il' }), false);
  });

  it('collects the distinct dates that need review rows', () => {
    const dates = pboDatesInSignals([
      pboSignal(),
      pboSignal({ signal_file_date: '2026-04-03' }),
      pboSignal(),
      { source_type: 'news', article_source: 'ynet.co.il', signal_file_date: '2026-04-09' },
    ]);
    assert.deepEqual(dates.sort(), ['2026-04-02', '2026-04-03']);
  });
});

describe('resolvePboReviewStates', () => {
  it('overlays the live store verdict onto a stale unreviewed stamp', () => {
    const store = new Map([['2026-04-02|צפת', 'reviewed_incomplete']]);
    const { signals, changed, resolved } = resolvePboReviewStates([pboSignal()], store);
    assert.equal(signals[0].pbo_review_state, 'reviewed_incomplete');
    assert.equal(signals[0].municipality, 'צפת');
    assert.equal(changed, 1);
    assert.equal(resolved, 1);
  });

  it('keeps the extract-time stamp when the store has no row', () => {
    const store = new Map([['2026-04-02|ראמה', 'reviewed_sufficient']]);
    const { signals, changed } = resolvePboReviewStates([pboSignal()], store);
    assert.equal(signals[0].pbo_review_state, 'unreviewed');
    assert.equal(changed, 0);
  });

  it('does not match a review row from a different date', () => {
    const store = new Map([['2026-04-03|צפת', 'reviewed_sufficient']]);
    const { signals } = resolvePboReviewStates([pboSignal()], store);
    assert.equal(signals[0].pbo_review_state, 'unreviewed');
  });

  it('leaves non-PBO signals untouched', () => {
    const news = { source_type: 'news', article_source: 'ynet.co.il', signal_file_date: '2026-04-02' };
    const store = new Map([['2026-04-02|צפת', 'reviewed_sufficient']]);
    const { signals } = resolvePboReviewStates([news], store);
    assert.equal(signals[0], news);
    assert.equal(signals[0].pbo_review_state, undefined);
  });

  it('is a no-op on an empty store rather than clearing stamps', () => {
    const input = [pboSignal({ pbo_review_state: 'reviewed_sufficient' })];
    const { signals, changed } = resolvePboReviewStates(input, new Map());
    assert.equal(signals, input);
    assert.equal(changed, 0);
  });

  it('counts a matched row that already agrees as resolved but not changed', () => {
    const store = new Map([['2026-04-02|צפת', 'unreviewed']]);
    const { changed, resolved } = resolvePboReviewStates([pboSignal()], store);
    assert.equal(resolved, 1);
    assert.equal(changed, 0);
  });
});
