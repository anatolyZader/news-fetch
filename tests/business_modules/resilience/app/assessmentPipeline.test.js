import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scopeAndPartitionSignals } from '../../../../business_modules/resilience/app/assessmentPipeline.js';

describe('assessmentPipeline.scopeAndPartitionSignals', () => {
  it('returns national scoped signals unchanged for national scope', () => {
    const signals = [{ signal_type: 'foo', scopeDecision: { inScope: true } }];
    const out = scopeAndPartitionSignals(signals, 'national');
    assert.equal(out.scopedSignals.length, 1);
    assert.equal(out.baseSignalsForScoring.length, 1);
    assert.equal(out.narrativeNationalContext.length, 0);
    assert.equal(out.narrativeScopeSignals.length, 1);
  });
});
