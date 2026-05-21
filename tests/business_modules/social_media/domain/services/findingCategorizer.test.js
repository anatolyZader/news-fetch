import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { categorizeFinding } from '../../../../../business_modules/social_media/domain/services/findingCategorizer.js';

describe('findingCategorizer', () => {
  it('maps resilience_component to category', () => {
    assert.equal(
      categorizeFinding({ resilience_component: 'lifesaving_behavior' }),
      'alerts_shelter',
    );
  });

  it('classifies shelter keywords', () => {
    assert.equal(
      categorizeFinding({ quote_original: 'רציתי להיכנס לממ"ד אבל לא הספקתי' }),
      'alerts_shelter',
    );
  });

  it('falls back to other when no match', () => {
    assert.equal(categorizeFinding({ quote_original: 'random unrelated text' }), 'other');
  });
});
