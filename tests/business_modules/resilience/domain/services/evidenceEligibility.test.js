import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  deriveSignalProvenance,
  metricsEligible,
  partitionMacroSignals,
  SIGNAL_PROVENANCE,
  annotateSignalsEpistemics,
} from '../../../../../business_modules/resilience/domain/services/evidenceEligibility.js';

describe('evidenceEligibility', () => {
  it('marks keyword_fallback as not metricsEligible', () => {
    const s = {
      source_type: 'news',
      scopeDecision: { isNorthRelevant: true, source: 'keyword_fallback', confidence: 'low' },
    };
    assert.equal(deriveSignalProvenance(s), SIGNAL_PROVENANCE.keyword_fallback);
    assert.equal(metricsEligible(s), false);
  });

  it('marks verified geo as metricsEligible', () => {
    const s = {
      source_type: 'news',
      scopeDecision: { isNorthRelevant: true, source: 'geo_tags', confidence: 'high' },
      geo: { kind: 'resolved', policy: { usableForMetrics: true } },
    };
    assert.equal(deriveSignalProvenance(s), SIGNAL_PROVENANCE.verified_geo);
    assert.equal(metricsEligible(s), true);
  });

  it('marks field source as metricsEligible', () => {
    const s = {
      source_type: 'field',
      scopeDecision: { isNorthRelevant: true, source: 'source_type', confidence: 'high' },
    };
    assert.equal(metricsEligible(s), true);
  });

  it('partitions macro and keyword signals out of north metrics', () => {
    const signals = annotateSignalsEpistemics([
      { source_type: 'field', evidence: 'ok', scopeDecision: { isNorthRelevant: true, source: 'source_type' } },
      {
        source_type: 'news',
        evidence: 'national',
        scopeDecision: { isNorthRelevant: true, source: 'keyword_fallback', macro_scope: 'national' },
        macro_scope: 'national',
      },
    ]);
    const { metricsSignals, macroSignals } = partitionMacroSignals(signals, 'north');
    assert.equal(metricsSignals.length, 1);
    assert.equal(macroSignals.length, 1);
  });
});
