import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  deriveSignalProvenance,
  metricsEligible,
  partitionMacroSignals,
  SIGNAL_PROVENANCE,
  annotateSignalsEpistemics,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/evidenceEligibility.js';

describe('evidenceEligibility', () => {
  it('marks metrics-unsafe resolved geo as not metricsEligible', () => {
    const s = {
      source_type: 'news',
      scopeDecision: { isNorthRelevant: true, source: 'geo_tags', confidence: 'low' },
      geo: { kind: 'resolved', policy: { usableForMetrics: false } },
    };
    assert.equal(deriveSignalProvenance(s), SIGNAL_PROVENANCE.source_assigned);
    assert.equal(metricsEligible(s), false);
  });

  it('marks verified geo as metricsEligible', () => {
    const s = {
      source_type: 'news',
      scopeDecision: { isNorthRelevant: true, source: 'geo_tags', confidence: 'high' },
      geo: { kind: 'resolved', policy: { usableForMetrics: true }, resolution: { provenance: 'structured' } },
    };
    assert.equal(deriveSignalProvenance(s), SIGNAL_PROVENANCE.verified_geo);
    assert.equal(metricsEligible(s), true);
  });

  it('does not mark text_inferred geo as verified_geo', () => {
    const s = {
      source_type: 'news',
      scopeDecision: { isNorthRelevant: true, source: 'geo_tags', confidence: 'low' },
      geo: {
        kind: 'resolved',
        policy: { usableForMetrics: false },
        resolution: { provenance: 'text_inferred' },
      },
    };
    assert.notEqual(deriveSignalProvenance(s), SIGNAL_PROVENANCE.verified_geo);
    assert.equal(metricsEligible(s), false);
  });

  it('marks field source as metricsEligible', () => {
    const s = {
      source_type: 'visits',
      scopeDecision: { isNorthRelevant: true, source: 'source_type', confidence: 'high' },
    };
    assert.equal(metricsEligible(s), true);
  });

  it('partitions macro signals out of north metrics', () => {
    const signals = annotateSignalsEpistemics([
      { source_type: 'visits', evidence: 'ok', scopeDecision: { isNorthRelevant: true, source: 'source_type' } },
      {
        source_type: 'news',
        evidence: 'national',
        scopeDecision: { isNorthRelevant: true, source: 'unknown', macro_scope: 'national' },
        macro_scope: 'national',
      },
    ]);
    const { metricsSignals, macroSignals } = partitionMacroSignals(signals, 'north');
    assert.equal(metricsSignals.length, 1);
    assert.equal(macroSignals.length, 1);
  });

  it('marks regional_press_context as not metricsEligible', () => {
    const s = {
      signalProvenance: SIGNAL_PROVENANCE.regional_press_context,
      narrativeContextOnly: true,
      evidence: 'northern israel',
    };
    assert.equal(deriveSignalProvenance(s), SIGNAL_PROVENANCE.regional_press_context);
    assert.equal(metricsEligible(s), false);
  });

  it('marks narrative_national_context as not metricsEligible', () => {
    const s = {
      signalProvenance: SIGNAL_PROVENANCE.narrative_national_context,
      narrativeContextOnly: true,
      evidence: 'northern israel',
    };
    assert.equal(deriveSignalProvenance(s), SIGNAL_PROVENANCE.narrative_national_context);
    assert.equal(metricsEligible(s), false);
  });
});
