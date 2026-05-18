import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrendsJson } from '../../../../business_modules/search_trends/infrastructure/adapters/parseTrendsJson.js';

describe('parseTrendsJson', () => {
  it('parses valid JSON', () => {
    assert.deepEqual(parseTrendsJson('{"a":1}', 't'), { a: 1 });
  });

  it('rejects HTML with helpful message', () => {
    assert.throws(
      () => parseTrendsJson('<html><body>x</body></html>', 'interestOverTime'),
      /HTML/,
    );
  });
});
