import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  filterSignalsForScope,
  isNorthSignal,
  normalizeReportScope,
} from '../../../../../business_modules/resilience/domain/services/regionSignalFilter.js';

describe('regionSignalFilter', () => {
  it('keeps national scope unfiltered', () => {
    const signals = [
      { source_type: 'news', evidence: 'Residents in Tel Aviv received guidance.' },
      { source_type: 'news', evidence: 'Residents in Kiryat Shmona entered shelters.' },
    ];

    const out = filterSignalsForScope(signals, 'national');
    assert.equal(out.length, 2);
    assert.ok(out[0].scopeDecision);
  });

  it('matches northern geography in news evidence', () => {
    assert.equal(
      isNorthSignal({ source_type: 'news', evidence: 'Kiryat Shmona residents entered shelters.' }),
      true,
    );
  });

  it('treats field and PBO signals as northern source data', () => {
    assert.equal(isNorthSignal({ source_type: 'field', evidence: 'Local team active.' }), true);
    assert.equal(isNorthSignal({ source_type: 'pbo', evidence: '[כרמיאל] רציפות תפקודית' }), true);
  });

  it('treats pbo_regional signals as northern even without geography in evidence (A3)', () => {
    assert.equal(
      isNorthSignal({ source_type: 'pbo_regional', evidence: 'volunteers reported steady attendance' }),
      true,
    );
  });

  it('treats resolved geo envelope as north without keyword haystack', () => {
    assert.equal(
      isNorthSignal({
        source_type: 'news',
        evidence: 'general municipal update',
        geo: {
          kind: 'resolved',
          pboSubregionId: 'golan',
          geoAreaTags: ['north', 'golan_heights'],
          policy: { usableForMetrics: true, scopeConfidence: 'high' },
        },
      }),
      true,
    );
  });

  it('does not treat resolved geo as verified north when usableForMetrics is false', () => {
    assert.equal(
      isNorthSignal({
        source_type: 'news',
        evidence: 'general municipal update',
        geo: {
          kind: 'resolved',
          pboSubregionId: 'golan',
          geoAreaTags: ['north', 'golan_heights'],
          policy: { usableForMetrics: false, scopeConfidence: 'low' },
        },
      }),
      false,
    );
  });

  it('filters out non-northern signals for north scope', () => {
    const signals = [
      { source_type: 'news', evidence: 'Tel Aviv municipality published instructions.' },
      { source_type: 'news', evidence: 'Haifa hospital continued operating.' },
      { source_type: 'naftali', evidence: 'Weekly municipality report.' },
    ];

    const out = filterSignalsForScope(signals, 'north');
    assert.deepEqual(out.map((s) => s.evidence), [signals[1].evidence, signals[2].evidence]);
    assert.equal(out[0].scopeDecision.isNorthRelevant, true);
  });

  it('normalizes unknown scopes to national', () => {
    assert.equal(normalizeReportScope('north'), 'north');
    assert.equal(normalizeReportScope('unknown'), 'national');
  });

  it('prefers resolved geo over keyword_fallback for reference locality', () => {
    const d = filterSignalsForScope(
      [
        {
          source_type: 'news',
          evidence: 'תושבי יבנאל דיווחו על לחץ ביומיום.',
          geo: {
            kind: 'resolved',
            policy: { usableForMetrics: true, scopeConfidence: 'high' },
            classification: { pboSubregionId: 'galma', geoAreaTags: ['north', 'galilee'] },
          },
        },
      ],
      'north',
    )[0]?.scopeDecision;
    assert.equal(d?.isNorthRelevant, true);
    assert.notEqual(d?.source, 'keyword_fallback');
  });

  it('matches reference-only Hebrew locality via keyword_fallback', () => {
    const d = filterSignalsForScope(
      [{ source_type: 'news', evidence: 'תושבי יבנאל דיווחו על לחץ ביומיום.' }],
      'north',
    )[0]?.scopeDecision;
    assert.equal(d?.isNorthRelevant, true);
    assert.equal(d?.source, 'keyword_fallback');
  });
});
