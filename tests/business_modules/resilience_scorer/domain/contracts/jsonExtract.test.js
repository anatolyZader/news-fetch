import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractJson,
  extractJsonArray,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/jsonExtract.js';

describe('extractJson — payload selection', () => {
  it('parses a bare object and a bare array', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
    assert.deepEqual(extractJson('[{"a":1},{"b":2}]'), [{ a: 1 }, { b: 2 }]);
  });

  it('keeps the array wrapper on a single-element array', () => {
    // The object slice `{"a":1}` also parses; taking it would silently strip
    // the array and hand callers the wrong shape.
    assert.deepEqual(extractJson('[{"a":1}]'), [{ a: 1 }]);
  });

  it('reads a fenced payload', () => {
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(extractJson('```json\n[{"a":1}]\n```'), [{ a: 1 }]);
  });

  it('ignores a markdown citation before an object payload', () => {
    // Regression: narrative prose carries inline citations, so a leading
    // sentence put `[` before the real `{`. Slicing from the first bracket
    // produced `[ynet](https://… }` and died on the URL colon a few characters
    // in — which is how a 58-minute replay lost its narrative to an error
    // message that named neither the cause nor the payload.
    const text = 'Updated [ynet](https://ynet.co.il/a) prose below.\n{"narrative":"x"}';
    assert.deepEqual(extractJson(text), { narrative: 'x' });
  });

  it('ignores a markdown citation before an array payload', () => {
    const text = 'See [src](https://x.co/y):\n[{"a":1}]';
    assert.deepEqual(extractJson(text), [{ a: 1 }]);
  });

  it('still repairs a malformed payload', () => {
    assert.deepEqual(extractJson('{"a":1,}'), { a: 1 });
  });

  it('rejects prose that repairs into a bare string', () => {
    assert.throws(
      () => extractJson('I could not produce JSON.'),
      /expected a JSON object or array/,
    );
  });

  it('names the raw text in the failure so it can be diagnosed after the fact', () => {
    assert.throws(() => extractJson('not json'), /Raw text began: not json/);
  });
});

describe('extractJsonArray — salvage', () => {
  it('recovers individual objects when the array itself is malformed', () => {
    assert.deepEqual(extractJsonArray('junk {"a":1}, {"b":2} junk'), [{ a: 1 }, { b: 2 }]);
  });

  it('throws when nothing is recoverable', () => {
    assert.throws(() => extractJsonArray('no objects here'), /Could not recover/);
  });
});
