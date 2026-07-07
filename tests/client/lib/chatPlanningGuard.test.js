import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isPlanningOnlyReply } from '../../../client/src/lib/chatPlanningGuard.js';

describe('isPlanningOnlyReply', () => {
  it('flags planning text without citations', () => {
    const text = "I'll search for press sources. Now let me retrieve the full text:";
    assert.equal(isPlanningOnlyReply(text), true);
  });

  it('does not flag answers with citations', () => {
    const text = "I'll search sources. See source_id: abc-123 and https://example.com/article";
    assert.equal(isPlanningOnlyReply(text), false);
  });

  it('does not flag normal answers without planning phrases', () => {
    assert.equal(isPlanningOnlyReply('The narrative split shows two camps in April coverage.'), false);
  });
});
