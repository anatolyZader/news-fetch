import test from 'node:test';
import assert from 'node:assert/strict';
import { isPoolSubtabId, POOL_SUBTAB_IDS } from '../../../../../business_modules/pool/domain/value_objects/poolSubtabId.js';

test('isPoolSubtabId accepts known subtabs', () => {
  assert.equal(isPoolSubtabId('naftali'), true);
  assert.equal(isPoolSubtabId('education'), true);
});

test('isPoolSubtabId rejects unknown', () => {
  assert.equal(isPoolSubtabId('other'), false);
  assert.equal(isPoolSubtabId(''), false);
  assert.equal(isPoolSubtabId(null), false);
});

test('POOL_SUBTAB_IDS is frozen set of ids', () => {
  assert.deepEqual(POOL_SUBTAB_IDS, ['naftali', 'education']);
});
