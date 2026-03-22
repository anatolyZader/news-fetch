import { describe, it } from 'node:test';
import assert from 'node:assert';

import { assertValidResilienceContentBatch } from '../../../../../business_modules/resilience/domain/services/resilienceBatchValidation.js';

const validItem = {
  id: '1',
  title: 'Test title',
  body: 'Body text',
};

describe('assertValidResilienceContentBatch', () => {
  it('accepts a minimal valid batch', () => {
    assert.doesNotThrow(() =>
      assertValidResilienceContentBatch({
        reportDate: '2026-03-22',
        contentKind: 'news',
        items: [validItem],
      }),
    );
  });

  it('accepts audio contentKind', () => {
    assert.doesNotThrow(() =>
      assertValidResilienceContentBatch({
        reportDate: '2026-03-22',
        contentKind: 'audio',
        items: [validItem],
      }),
    );
  });

  it('rejects empty items', () => {
    assert.throws(
      () =>
        assertValidResilienceContentBatch({
          reportDate: '2026-03-22',
          contentKind: 'news',
          items: [],
        }),
      /items/i,
    );
  });

  it('rejects invalid reportDate', () => {
    assert.throws(
      () =>
        assertValidResilienceContentBatch({
          reportDate: '22-03-2026',
          contentKind: 'news',
          items: [validItem],
        }),
      /reportDate/i,
    );
  });

  it('rejects invalid contentKind', () => {
    assert.throws(
      () =>
        assertValidResilienceContentBatch({
          reportDate: '2026-03-22',
          contentKind: 'tv',
          items: [validItem],
        }),
      /contentKind/i,
    );
  });

  it('rejects item missing id', () => {
    assert.throws(
      () =>
        assertValidResilienceContentBatch({
          reportDate: '2026-03-22',
          contentKind: 'news',
          items: [{ title: 't', body: 'b' }],
        }),
      /id/i,
    );
  });

  it('rejects item missing title', () => {
    assert.throws(
      () =>
        assertValidResilienceContentBatch({
          reportDate: '2026-03-22',
          contentKind: 'news',
          items: [{ id: '1', body: 'b' }],
        }),
      /title/i,
    );
  });

  it('rejects item missing body', () => {
    assert.throws(
      () =>
        assertValidResilienceContentBatch({
          reportDate: '2026-03-22',
          contentKind: 'news',
          items: [{ id: '1', title: 't' }],
        }),
      /body/i,
    );
  });
});
