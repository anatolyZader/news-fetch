import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calcEmbeddingCostUsd,
  calcRerankCostUsd,
  EMBEDDING_USD_PER_MTOK,
} from '../../../cross-cut-modules/budget/app/budgetCostTracker.js';

describe('embedding and rerank cost helpers', () => {
  it('calcEmbeddingCostUsd uses tokens and env rate', () => {
    const cost = calcEmbeddingCostUsd('text-embedding-3-small', { total_tokens: 1_000_000 });
    assert.equal(cost, EMBEDDING_USD_PER_MTOK);
    assert.equal(calcEmbeddingCostUsd('text-embedding-3-small', { total_tokens: 0 }), 0);
  });

  it('calcRerankCostUsd charges per search when documents present', () => {
    assert.ok(calcRerankCostUsd('rerank-v3.5', { documentCount: 5 }) > 0);
    assert.equal(calcRerankCostUsd('rerank-v3.5', { documentCount: 0 }), 0);
  });
});
