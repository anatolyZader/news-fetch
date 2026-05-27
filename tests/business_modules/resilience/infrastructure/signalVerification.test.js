import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  tokenize,
  shingles,
  jaccard,
  verifyEvidenceAgainstArticle,
  verifySourceNativeQuote,
  orderedSubsequenceContainment,
  signalDedupKey,
  dedupeSignalsWithinBatch,
  containsHebrew,
} from '../../../../business_modules/resilience/infrastructure/signalVerification.js';

describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    const t = tokenize('Hello, World! It IS a test.');
    assert.deepEqual(t, ['hello', 'world', 'it', 'is', 'a', 'test']);
  });

  it('preserves Hebrew letters', () => {
    const t = tokenize('שלום עולם, מקלט פתוח.');
    assert.ok(t.includes('שלום'));
    assert.ok(t.includes('עולם'));
    assert.ok(t.includes('מקלט'));
  });

  it('returns empty array for null/empty input', () => {
    assert.deepEqual(tokenize(null), []);
    assert.deepEqual(tokenize(''), []);
    assert.deepEqual(tokenize(undefined), []);
  });
});

describe('shingles', () => {
  it('produces 3-gram shingles by default', () => {
    const s = shingles(['a', 'b', 'c', 'd', 'e']);
    assert.ok(s.has('a b c'));
    assert.ok(s.has('b c d'));
    assert.ok(s.has('c d e'));
    assert.equal(s.size, 3);
  });

  it('returns the joined sequence when shorter than k', () => {
    const s = shingles(['a', 'b'], 3);
    assert.equal(s.size, 1);
    assert.ok(s.has('a b'));
  });

  it('returns empty set for empty input', () => {
    assert.equal(shingles([]).size, 0);
  });
});

describe('jaccard', () => {
  it('computes correct similarity for partially overlapping sets', () => {
    const a = new Set(['x', 'y', 'z']);
    const b = new Set(['y', 'z', 'q']);
    assert.equal(jaccard(a, b), 2 / 4);
  });

  it('returns 1 for identical sets', () => {
    const a = new Set(['x', 'y']);
    const b = new Set(['x', 'y']);
    assert.equal(jaccard(a, b), 1);
  });

  it('returns 0 for disjoint sets', () => {
    assert.equal(jaccard(new Set(['x']), new Set(['y'])), 0);
  });

  it('returns 0 for empty inputs', () => {
    assert.equal(jaccard(new Set(), new Set()), 0);
  });
});

describe('verifyEvidenceAgainstArticle', () => {
  const article = {
    body:
      'Residents of Kiryat Shmona reported that they entered the public shelter when the siren sounded. ' +
      'A municipal official said the council had distributed updated guidelines about safe rooms. ' +
      'Several families described how they had spent the night together with their children. ' +
      'A 48-year-old resident said she has not slept in three nights since the attacks began.',
  };

  it('passes a paraphrase that overlaps the article', () => {
    const signal = {
      signal_type: 'compliance_enter_shelter',
      evidence_type: 'observational_reported_fact',
      evidence: 'residents entered the public shelter when the siren sounded',
    };
    const r = verifyEvidenceAgainstArticle(signal, article.body);
    assert.equal(r.ok, true);
  });

  it('drops a hallucinated quote that has no overlap with the article', () => {
    const signal = {
      signal_type: 'leadership_clear_guidance',
      evidence_type: 'direct_quote_named_person',
      evidence: 'The Prime Minister announced a national day of recovery investments',
    };
    const r = verifyEvidenceAgainstArticle(signal, article.body);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'low_similarity');
  });

  it('passes a direct quote that exists as a sentence in the article body', () => {
    const signal = {
      signal_type: 'psychological_distress',
      evidence_type: 'direct_quote_named_person',
      evidence: 'a 48-year-old resident said she has not slept in three nights since the attacks began',
    };
    const r = verifyEvidenceAgainstArticle(signal, article.body);
    assert.equal(r.ok, true);
  });

  it('bypasses verification for inferred-absence signals', () => {
    const signal = {
      signal_type: 'routine_maintenance',
      evidence_type: 'observational_reported_fact',
      evidence_basis: 'inferred_absence',
      evidence: 'school year started normally with no disruptions reported',
    };
    const r = verifyEvidenceAgainstArticle(signal, 'completely unrelated body text');
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'inferred_absence');
  });

  it('drops a signal with empty evidence text', () => {
    const signal = { signal_type: 'compliance_enter_shelter', evidence_type: 'observational_reported_fact', evidence: '' };
    const r = verifyEvidenceAgainstArticle(signal, article.body);
    assert.equal(r.ok, false);
  });

  it('passes when no article body is available (cannot verify)', () => {
    const signal = { signal_type: 'compliance_enter_shelter', evidence_type: 'observational_reported_fact', evidence: 'some text' };
    const r = verifyEvidenceAgainstArticle(signal, null);
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'no_body');
  });

  it('handles short evidence with the short-overlap fallback', () => {
    const signal = {
      signal_type: 'compliance_enter_shelter',
      evidence_type: 'observational_reported_fact',
      evidence: 'entered shelter siren',
    };
    const r = verifyEvidenceAgainstArticle(signal, article.body);
    assert.equal(r.ok, true);
  });

  it('passes via evidence_span when offsets match', () => {
    const body = 'Residents entered shelter when siren sounded in Kiryat Shmona.';
    const quote = 'entered shelter when siren sounded';
    const start = body.indexOf(quote);
    const signal = {
      signal_type: 'compliance_enter_shelter',
      evidence_type: 'observational_reported_fact',
      evidence: quote,
      evidence_span: { start, end: start + quote.length },
    };
    const r = verifyEvidenceAgainstArticle(signal, body);
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'evidence_span');
  });

  it('passes short Hebrew crisis quote via ordered subsequence', () => {
    const body = 'עזרה! אנחנו בוערים';
    const signal = {
      signal_type: 'panic_behavior',
      evidence_type: 'observational_reported_fact',
      evidence: 'אנחנו בוערים',
    };
    const r = verifyEvidenceAgainstArticle(signal, body);
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'ordered_subsequence');
  });
});

describe('verifySourceNativeQuote', () => {
  it('matches verbatim short WhatsApp message', () => {
    const r = verifySourceNativeQuote('שקט בקריית שמונה', 'שקט בקריית שמונה');
    assert.equal(r.ok, true);
  });
});

describe('orderedSubsequenceContainment', () => {
  it('requires full match for 3-token evidence when threshold is 1', () => {
    const ev = ['we', 'burning', 'help'];
    const body = ['noise', 'we', 'are', 'burning', 'help'];
    assert.equal(orderedSubsequenceContainment(ev, body), 1);
  });
});

describe('dedupeSignalsWithinBatch', () => {
  it('keeps the first occurrence and drops identical later ones', () => {
    const sigs = [
      { article_index: 1, signal_type: 'service_continuity', evidence: 'Hospital A operating' },
      { article_index: 1, signal_type: 'service_continuity', evidence: 'Hospital A operating' },
      { article_index: 2, signal_type: 'service_continuity', evidence: 'Hospital B operating' },
    ];
    const out = dedupeSignalsWithinBatch(sigs);
    assert.equal(out.length, 2);
    assert.equal(out[0].article_index, 1);
    assert.equal(out[1].article_index, 2);
  });

  it('treats different article_index as different signals', () => {
    const sigs = [
      { article_index: 1, signal_type: 'service_continuity', evidence: 'same evidence here' },
      { article_index: 2, signal_type: 'service_continuity', evidence: 'same evidence here' },
    ];
    assert.equal(dedupeSignalsWithinBatch(sigs).length, 2);
  });

  it('treats different signal_type as different signals', () => {
    const sigs = [
      { article_index: 1, signal_type: 'service_continuity', evidence: 'same evidence here' },
      { article_index: 1, signal_type: 'service_disruption', evidence: 'same evidence here' },
    ];
    assert.equal(dedupeSignalsWithinBatch(sigs).length, 2);
  });
});

describe('signalDedupKey', () => {
  it('is stable when irrelevant punctuation differs', () => {
    const a = { article_index: 1, signal_type: 't', evidence: 'A, B! C?' };
    const b = { article_index: 1, signal_type: 't', evidence: 'a b c' };
    assert.equal(signalDedupKey(a), signalDedupKey(b));
  });
});

describe('containsHebrew', () => {
  it('returns true when text has Hebrew letters', () => {
    assert.equal(containsHebrew('שלום'), true);
  });
  it('returns false for English-only text', () => {
    assert.equal(containsHebrew('hello'), false);
  });
  it('returns false for non-string input', () => {
    assert.equal(containsHebrew(null), false);
    assert.equal(containsHebrew(123), false);
  });
});
