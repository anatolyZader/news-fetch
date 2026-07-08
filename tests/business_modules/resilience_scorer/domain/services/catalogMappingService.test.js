import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapObservationToSignal,
  mapObservationsToSignals,
  resolveCatalogTypeForObservation,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/catalogMappingService.js';

describe('catalogMappingService', () => {
  it('resolveCatalogTypeForObservation uses suggested then nearest', () => {
    assert.equal(
      resolveCatalogTypeForObservation({
        suggested_catalog_types: ['compliance_enter_shelter'],
      }),
      'compliance_enter_shelter',
    );
    assert.equal(
      resolveCatalogTypeForObservation({
        nearest_existing_types: ['solidarity_help_others'],
      }),
      'solidarity_help_others',
    );
    assert.equal(resolveCatalogTypeForObservation({}), null);
  });

  it('mapObservationToSignal skips unmapped', () => {
    const { skipped, signal } = mapObservationToSignal({ evidence: 'x' });
    assert.equal(skipped, true);
    assert.equal(signal, null);
  });

  it('mapObservationsToSignals maps valid types', () => {
    const { signals, mapped, skipped } = mapObservationsToSignals([
      { evidence: 'a', suggested_catalog_types: ['panic_behavior'] },
      { evidence: 'b' },
    ], { sourceType: 'news' });
    assert.equal(mapped, 1);
    assert.equal(skipped, 1);
    assert.equal(signals[0].signal_type, 'panic_behavior');
    assert.equal(signals[0].source_type, 'news');
  });
});
