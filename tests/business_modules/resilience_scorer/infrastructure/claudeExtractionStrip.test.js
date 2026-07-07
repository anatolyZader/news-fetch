import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripTraceFields } from '../../../../business_modules/resilience_scorer/infrastructure/claudeExtraction.js';

describe('stripTraceFields', () => {
  it('removes trace-only / rationale (B) fields', () => {
    const signal = {
      signal_type: 'service_continuity',
      evidence: 'schools reopen',
      confidence: 0.7,
      article_index: 3,
      rationale: 'named restart date',
      _pass: 'B',
      _dropped_reason: { stage: 'self_check', reason: 'x' },
      _self_check: { verdict: 'uncertain' },
      _from_cache: true,
    };
    const clean = stripTraceFields(signal);

    assert.equal(clean.signal_type, 'service_continuity');
    assert.equal(clean.evidence, 'schools reopen');
    assert.equal(clean.confidence, 0.7);
    assert.equal(clean.article_index, 3);
    assert.equal('rationale' in clean, false);
    assert.equal('_pass' in clean, false);
    assert.equal('_dropped_reason' in clean, false);
    assert.equal('_self_check' in clean, false);
    assert.equal('_from_cache' in clean, false);
  });

  it('does not mutate the input signal', () => {
    const signal = { signal_type: 'x', rationale: 'keep-on-original' };
    const clean = stripTraceFields(signal);
    assert.equal(signal.rationale, 'keep-on-original');
    assert.equal('rationale' in clean, false);
  });

  it('passes through non-object inputs', () => {
    assert.equal(stripTraceFields(null), null);
    assert.equal(stripTraceFields(undefined), undefined);
  });
});
