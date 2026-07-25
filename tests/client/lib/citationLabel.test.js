import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { citationChipLabel } from '../../../client/src/lib/citationLabel.js';

describe('citationChipLabel', () => {
  it('prefers the title when present', () => {
    assert.equal(
      citationChipLabel({ title: 'Shelter behavior in Haifa', source_id: 'md:x/y.md#1' }),
      'Shelter behavior in Haifa',
    );
  });

  it('truncates long titles to 40 chars', () => {
    const title = 'a'.repeat(60);
    assert.equal(citationChipLabel({ title }).length, 40);
  });

  it('uses the distinguishing tail of md: path ids, not the shared prefix', () => {
    const label = citationChipLabel({
      source_id: 'md:business_modules/news-sites/articles_2026-04-01.md#3',
    });
    assert.equal(label, 'articles_2026-04-01.md#3');
  });

  it('keeps short ids without slashes as-is', () => {
    assert.equal(citationChipLabel({ source_id: 'db:17' }), 'db:17');
  });

  it('truncates an overlong tail from the front, keeping the end', () => {
    const label = citationChipLabel({ source_id: `md:dir/${'x'.repeat(50)}#12` });
    assert.equal(label.length, 41);
    assert.ok(label.startsWith('…'));
    assert.ok(label.endsWith('#12'));
  });

  it('handles missing fields', () => {
    assert.equal(citationChipLabel({}), '');
    assert.equal(citationChipLabel(null), '');
  });
});
