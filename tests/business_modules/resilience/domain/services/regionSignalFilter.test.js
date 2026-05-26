import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  filterSignalsForScope,
  isNorthSignal,
  normalizeReportScope,
  scopeDecisionForSignal,
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

  it('does not scope news by place name without resolved geo', () => {
    assert.equal(
      isNorthSignal({ source_type: 'news', evidence: 'Kiryat Shmona residents entered shelters.' }),
      false,
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

  it('scopes north from resolved geo even when usableForMetrics is false', () => {
    const d = scopeDecisionForSignal({
      source_type: 'news',
      evidence: 'general municipal update',
      geo: {
        kind: 'resolved',
        pboSubregionId: 'golan',
        geoAreaTags: ['north', 'golan_heights'],
        policy: { usableForMetrics: false, scopeConfidence: 'low' },
      },
    });
    assert.equal(d.isNorthRelevant, true);
    assert.equal(d.source, 'geo_tags');
    assert.equal(d.confidence, 'low');
  });

  it('filters out non-northern signals for north scope', () => {
    const signals = [
      { source_type: 'news', evidence: 'Tel Aviv municipality published instructions.' },
      {
        source_type: 'news',
        evidence: 'Haifa hospital continued operating.',
        geo: {
          kind: 'resolved',
          policy: { usableForMetrics: true, scopeConfidence: 'high' },
          classification: { pboSubregionId: 'haifa', geoAreaTags: ['north', 'haifa'] },
        },
      },
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

  it('uses resolved geo for reference locality in evidence', () => {
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
    assert.equal(d?.source, 'geo_tags');
  });

  it('does not match bare "north" without resolved geo', () => {
    assert.equal(
      isNorthSignal({ source_type: 'news', evidence: 'Policy shift in the north discussed nationally.' }),
      false,
    );
  });

  it('does not scope "northern israel" macro language without resolved geo', () => {
    const d = scopeDecisionForSignal({
      source_type: 'news',
      evidence: 'Compensation for northern israel communities debated.',
    });
    assert.equal(d?.isNorthRelevant, false);
    assert.equal(d?.source, 'unknown');
  });

  it('excludes news with only text locality and no geo envelope', () => {
    const d = scopeDecisionForSignal({
      source_type: 'news',
      evidence: 'תושבי יבנאל דיווחו על לחץ ביומיום.',
    });
    assert.equal(d?.isNorthRelevant, false);
    assert.equal(d?.source, 'unknown');
  });
});
