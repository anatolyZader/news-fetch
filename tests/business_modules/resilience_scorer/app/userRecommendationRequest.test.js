import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserRecommendationRequest } from '../../../../business_modules/resilience_scorer/app/user/userRecommendationService.js';

describe('parseUserRecommendationRequest', () => {
  it('rejects empty id', () => {
    const r = parseUserRecommendationRequest({ id: '' });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 400);
  });

  it('rejects invalid action', () => {
    const r = parseUserRecommendationRequest({ id: 'r1', action: 'maybe' });
    assert.equal(r.ok, false);
  });

  it('accepts dismiss', () => {
    const r = parseUserRecommendationRequest({ id: 'r1', action: 'dismiss', scope: 'north' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.action, 'dismiss');
      assert.equal(r.scope, 'north');
    }
  });
});
