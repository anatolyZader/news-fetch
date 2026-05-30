import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterSignalsForScope,
  normalizeReportScope,
  scopeDecisionForSignal,
} from '../../../../../business_modules/resilience/domain/services/regionSignalFilter.js';

function northScopeRelevant(signal) {
  return scopeDecisionForSignal(signal, 'north').isScopeRelevant;
}

describe('regionSignalFilter', () => {
  it('keeps national scope unfiltered', () => {
    const signals = [
      { source_type: 'news', evidence: 'Residents in Tel Aviv received guidance.' },
      { source_type: 'news', evidence: 'Residents in Kiryat Shmona entered shelters.' },
    ];

    const out = filterSignalsForScope(signals, 'national');
    assert.equal(out.length, 2);
    assert.ok(out[0].scopeDecision);
    assert.equal(out[0].scopeDecision.isScopeRelevant, true);
  });

  it('does not scope news by place name without resolved geo', () => {
    assert.equal(
      northScopeRelevant({ source_type: 'news', evidence: 'Kiryat Shmona residents entered shelters.' }),
      false,
    );
  });

  it('treats collection-scoped field and PBO signals as north when scope is north', () => {
    assert.equal(northScopeRelevant({ source_type: 'field', evidence: 'Local team active.' }), true);
    assert.equal(northScopeRelevant({ source_type: 'pbo', evidence: '[כרמיאל] רציפות תפקודית' }), true);
  });

  it('treats pbo_regional signals as north via collection scope', () => {
    assert.equal(
      northScopeRelevant({ source_type: 'pbo_regional', evidence: 'volunteers reported steady attendance' }),
      true,
    );
  });

  it('treats resolved geo envelope as north without keyword haystack', () => {
    assert.equal(
      northScopeRelevant({
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

  it('scopes south from geoAreaTags', () => {
    const d = scopeDecisionForSignal(
      {
        source_type: 'news',
        evidence: 'Beer Sheva update',
        geo: {
          kind: 'resolved',
          classification: { geoAreaTags: ['south'] },
          policy: { usableForMetrics: true, scopeConfidence: 'high' },
        },
      },
      'south',
    );
    assert.equal(d.isScopeRelevant, true);
    assert.equal(d.source, 'geo_tags');
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
    }, 'north');
    assert.equal(d.isScopeRelevant, true);
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
          classification: { geoAreaTags: ['haifa'] },
        },
      },
      { source_type: 'naftali', evidence: 'Weekly municipality report.' },
    ];

    const out = filterSignalsForScope(signals, 'north');
    assert.deepEqual(out.map((s) => s.evidence), [signals[2].evidence]);
    assert.equal(out[0].scopeDecision.isScopeRelevant, true);
    assert.equal(out[0].scopeDecision.source, 'collection_scope');
  });

  it('normalizes unknown scopes to national', () => {
    assert.equal(normalizeReportScope('north'), 'north');
    assert.equal(normalizeReportScope('south'), 'south');
    assert.equal(normalizeReportScope('unknown'), 'national');
    assert.equal(normalizeReportScope('center'), 'jerusalem');
  });
});
