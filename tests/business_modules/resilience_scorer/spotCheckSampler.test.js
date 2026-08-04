import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSpotChecks } from '../../../business_modules/resilience_scorer/domain/services/signals/spotCheckSampler.js';

function makeSignals() {
  const signals = [];
  const specs = [
    ['news', 'fear_expression', 6],
    ['news', 'adaptive_practice', 4],
    ['radio', 'active_information_seeking', 3],
    ['visits', 'agricultural_damage', 2],
  ];
  let i = 0;
  for (const [sourceType, signalType, count] of specs) {
    for (let k = 0; k < count; k++) {
      signals.push({
        source_type: sourceType,
        signal_type: signalType,
        evidence: `evidence ${i}`,
        evidence_type: 'direct_quote_named_person',
        article_url: `https://example.com/${i}`,
        article_source: 'example.com',
      });
      i++;
    }
  }
  return signals;
}

describe('spotCheckSampler', () => {
  it('is deterministic for the same reportDate and scope', () => {
    const opts = { signals: makeSignals(), reportDate: '2026-08-04', scopeId: 'national', sampleSize: 6 };
    const a = sampleSpotChecks(opts);
    const b = sampleSpotChecks(opts);
    assert.deepEqual(a, b);
    const other = sampleSpotChecks({ ...opts, scopeId: 'north' });
    assert.notDeepEqual(a.map((r) => r.evidence), other.map((r) => r.evidence));
  });

  it('covers every stratum at least once when the budget allows', () => {
    const sample = sampleSpotChecks({
      signals: makeSignals(), reportDate: '2026-08-04', scopeId: 'national', sampleSize: 6,
    });
    assert.equal(sample.length, 6);
    const strata = new Set(sample.map((r) => r.strata_key));
    assert.equal(strata.size, 4);
  });

  it('returns empty for sampleSize 0 or empty pool', () => {
    assert.deepEqual(sampleSpotChecks({ signals: makeSignals(), reportDate: 'd', scopeId: 's', sampleSize: 0 }), []);
    assert.deepEqual(sampleSpotChecks({ signals: [], reportDate: 'd', scopeId: 's', sampleSize: 5 }), []);
  });

  it('returns the whole pool when it is smaller than sampleSize, without duplicates', () => {
    const signals = makeSignals().slice(0, 3);
    const sample = sampleSpotChecks({ signals, reportDate: '2026-08-04', scopeId: 'national', sampleSize: 10 });
    assert.equal(sample.length, 3);
    assert.equal(new Set(sample.map((r) => r.evidence)).size, 3);
  });

  it('annotates primary components from the routing catalog and marks records pending', () => {
    const sample = sampleSpotChecks({
      signals: [{ source_type: 'news', signal_type: 'active_information_seeking', evidence: 'e' }],
      reportDate: '2026-08-04',
      scopeId: 'national',
      sampleSize: 1,
    });
    assert.deepEqual(sample[0].components, ['information_communication']);
    assert.equal(sample[0].status, 'pending');
    assert.equal(sample[0].strata_key, 'news|active_information_seeking');
    assert.equal(sample[0].report_date, '2026-08-04');
  });
});
