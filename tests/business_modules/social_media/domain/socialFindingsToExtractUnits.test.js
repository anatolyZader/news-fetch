import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { socialFindingsToExtractUnits } from '../../../../business_modules/social_media/domain/services/socialFindingsToExtractUnits.js';

describe('socialFindingsToExtractUnits', () => {
  it('maps classified findings to extract units with body text', () => {
    const units = socialFindingsToExtractUnits([
      {
        id: 'f1',
        quote_original: 'תושבים נכנסו למרחב המוגן',
        platform: 'telegram_public',
        url: 'https://example.com/post',
        resilience_component: 'lifesaving_behavior',
        behavior_or_emotion: 'compliance',
      },
    ]);
    assert.equal(units.length, 1);
    assert.ok(units[0].body.includes('תושבים נכנסו למרחב המוגן'));
    assert.equal(units[0].url, 'https://example.com/post');
    assert.equal(units[0].article_index, 1);
  });
});
