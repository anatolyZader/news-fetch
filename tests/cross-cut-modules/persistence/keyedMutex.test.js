import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createKeyedMutex } from '../../../cross-cut-modules/persistence/infrastructure/keyedMutex.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createKeyedMutex', () => {
  it('serializes calls on the same key', async () => {
    const mutex = createKeyedMutex();
    const order = [];
    await Promise.all([
      mutex.runExclusive('k', async () => { await delay(30); order.push('first'); }),
      mutex.runExclusive('k', async () => { order.push('second'); }),
    ]);
    assert.deepEqual(order, ['first', 'second']);
  });

  it('runs different keys concurrently', async () => {
    const mutex = createKeyedMutex();
    const order = [];
    await Promise.all([
      mutex.runExclusive('a', async () => { await delay(30); order.push('slow-a'); }),
      mutex.runExclusive('b', async () => { order.push('fast-b'); }),
    ]);
    assert.deepEqual(order, ['fast-b', 'slow-a']);
  });

  it('keeps working after a failure in the chain', async () => {
    const mutex = createKeyedMutex();
    await assert.rejects(mutex.runExclusive('k', () => { throw new Error('boom'); }), /boom/);
    const result = await mutex.runExclusive('k', () => 'ok');
    assert.equal(result, 'ok');
  });

  it('returns the callback result', async () => {
    const mutex = createKeyedMutex();
    assert.equal(await mutex.runExclusive('k', async () => 42), 42);
  });
});
