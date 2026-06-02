import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetWireApplicationForTests } from '../../composition/wireApplication.js';

describe('composition/createApp', () => {
  it('loads createApp module', async () => {
    resetWireApplicationForTests();
    const { createApp } = await import('../../composition/createApp.js');
    assert.equal(typeof createApp, 'function');
  });

  it('createApp throws without api key', async () => {
    resetWireApplicationForTests();
    const { createApp } = await import('../../composition/createApp.js');
    await assert.rejects(
      () => createApp({
        apiKey: '',
        fetchArticlesForDay: async () => [],
      }),
      /API key is required/,
    );
  });
});
