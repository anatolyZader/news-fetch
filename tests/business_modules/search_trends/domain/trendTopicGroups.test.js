import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTopicsByGroup,
  normalizeTrendTopicGroup,
} from '../../../../business_modules/search_trends/domain/trendTopicGroups.js';

describe('trendTopicGroups', () => {
  const topics = [
    { id: 'a', group: 'emergency' },
    { id: 'b', group: 'services' },
    { id: 'c', group: 'psycho' },
  ];

  it('normalizes group id', () => {
    assert.equal(normalizeTrendTopicGroup('psycho'), 'psycho');
    assert.equal(normalizeTrendTopicGroup('invalid'), 'all');
  });

  it('filters topics by group', () => {
    assert.equal(filterTopicsByGroup(topics, 'all').length, 3);
    assert.equal(filterTopicsByGroup(topics, 'emergency').length, 1);
    assert.equal(filterTopicsByGroup(topics, 'services')[0].id, 'b');
  });
});
