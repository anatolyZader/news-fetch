import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectionDistrictForSourceType,
  isStructuredCollectionSource,
  resetCollectionScopeCache,
} from '../../../../../business_modules/resilience/domain/services/collectionScope.js';

describe('collectionScope', () => {
  it('maps structured north-theater source types', () => {
    resetCollectionScopeCache();
    assert.equal(collectionDistrictForSourceType('pbo'), 'north');
    assert.equal(collectionDistrictForSourceType('field'), 'north');
    assert.equal(isStructuredCollectionSource('pbo'), true);
    assert.equal(isStructuredCollectionSource('news'), false);
  });
});
