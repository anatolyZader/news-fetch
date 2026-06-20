import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeObservation,
  validateObservationBundle,
  observationBundleFilename,
  isValidProfile,
} from '../../../../business_modules/signals_extraction/domain/services/observationSchema.js';

describe('observationSchema', () => {
  it('normalizeObservation requires evidence', () => {
    assert.equal(normalizeObservation({ behavioral_description: 'x' }, 0), null);
    const n = normalizeObservation({ evidence: 'quote text', article_index: 2 }, 0);
    assert.equal(n.article_index, 2);
    assert.equal(n.evidence, 'quote text');
  });

  it('validateObservationBundle accepts valid bundle', () => {
    const { valid, bundle } = validateObservationBundle({
      profile: 'exploratory',
      date: '2026-05-01',
      observations: [{ evidence: 'fact', behavioral_description: 'label' }],
    });
    assert.equal(valid, true);
    assert.equal(bundle.observations.length, 1);
  });

  it('validateObservationBundle allows empty observations for pipeline profile', () => {
    const { valid, errors, bundle } = validateObservationBundle({
      profile: 'pipeline',
      source_type: 'pbo',
      date: '2026-05-01',
      observations: [],
    });
    assert.equal(valid, true, errors.join('; '));
    assert.deepEqual(bundle.observations, []);
  });

  it('validateObservationBundle rejects empty observations for exploratory profile', () => {
    const { valid } = validateObservationBundle({
      profile: 'exploratory',
      date: '2026-05-01',
      observations: [],
    });
    assert.equal(valid, false);
  });

  it('observationBundleFilename', () => {
    assert.equal(
      observationBundleFilename('document_pack', '2026-05-01'),
      'observations-document_pack-2026-05-01.json',
    );
  });

  it('isValidProfile', () => {
    assert.equal(isValidProfile('residual'), true);
    assert.equal(isValidProfile('invalid'), false);
  });
});
