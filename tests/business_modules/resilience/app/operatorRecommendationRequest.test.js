import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseOperatorRecommendationRequest } from '../../../../business_modules/resilience/app/operatorRecommendationService.js';

describe('parseOperatorRecommendationRequest', () => {
  it('rejects empty id', () => {
    const r = parseOperatorRecommendationRequest({ id: '' });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 400);
  });

  it('rejects invalid action', () => {
    const r = parseOperatorRecommendationRequest({ id: 'r1', action: 'maybe' });
    assert.equal(r.ok, false);
  });

  it('accepts dismiss', () => {
    const r = parseOperatorRecommendationRequest({ id: 'r1', action: 'dismiss', scope: 'north' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.action, 'dismiss');
      assert.equal(r.scope, 'north');
    }
  });
});
