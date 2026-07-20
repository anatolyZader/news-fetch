import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveNorthClusterId,
  buildNorthClusterPartitions,
  buildNorthClusterNarrativesFromSignals,
} from '../../../../../business_modules/resilience_scorer/domain/services/narrative/northClusterNarrative.js';

describe('northClusterNarrative', () => {
  it('resolveNorthClusterId reads pbo subregion from geo', () => {
    const signal = {
      geo: {
        kind: 'resolved',
        classification: { pboSubregionId: 'naftali', geoAreaTags: ['north'] },
      },
    };
    assert.equal(resolveNorthClusterId(signal), 'naftali');
  });

  it('unclustered when no subregion', () => {
    assert.equal(resolveNorthClusterId({ source_type: 'news' }), 'unclustered');
  });

  it('buildNorthClusterNarrativesFromSignals groups by cluster', () => {
    const signals = [
      {
        source_type: 'visits',
        signal_type: 'information_clarity',
        evidence: 'Naftali field note.',
        geo: { kind: 'resolved', classification: { pboSubregionId: 'naftali' } },
      },
      {
        source_type: 'pbo',
        signal_type: 'compliance_enter_shelter',
        evidence: 'Galma shelter compliance.',
        geo: { kind: 'resolved', classification: { pboSubregionId: 'galma' } },
      },
    ];
    const narratives = buildNorthClusterNarrativesFromSignals(signals);
    assert.ok(narratives.naftali);
    assert.ok(narratives.galma);
    assert.equal(narratives.naftali.signal_count, 1);
    assert.equal(buildNorthClusterPartitions(signals).naftali.length, 1);
  });
});
