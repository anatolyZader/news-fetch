import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMappedObservationBundleAdapter } from '../../../../business_modules/resilience_scorer/infrastructure/adapters/mappedObservationBundleAdapter.js';

describe('mappedObservationBundleAdapter', () => {
  it('loads and maps observation bundles', () => {
    const port = createMappedObservationBundleAdapter({
      observationsProfile: 'exploratory',
      loadObservationBundles: () => [{
        filename: 'observations-exploratory-2026-05-27.json',
        date: '2026-05-27',
        bundle: {
          profile: 'exploratory',
          source_type: 'news',
          date: '2026-05-27',
          observations: [
            { evidence: 'quote', suggested_catalog_types: ['panic_behavior'] },
            { evidence: 'unmapped' },
          ],
        },
      }],
    });

    const discovery = port.discoverBundles({ targetDate: '2026-05-27', days: 1 });
    assert.equal(discovery.anyDirExists, true);

    const loaded = port.loadBundles(discovery, { targetDate: '2026-05-27' });
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].data.signals.length, 1);
    assert.equal(loaded[0].data.signals[0].signal_type, 'panic_behavior');
    assert.equal(loaded[0].data._from_observations, true);
  });
});
