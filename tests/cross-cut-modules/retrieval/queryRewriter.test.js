import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteQueryForRetrieval } from '../../../cross-cut-modules/retrieval/queryRewriter.js';

test('rewriteQueryForRetrieval parses JSON query from mocked client', async () => {
  process.env.RAG_QUERY_REWRITE_ENABLED = '1';

  const q = await rewriteQueryForRetrieval(
    {
      message: 'מה עם המקלטים?',
      history: [{ role: 'user', content: 'דוח חיפה' }],
      systemHint: 'archive search',
    },
    {
      llmPort: {
        createMessage: async () => ({
          content: [{ type: 'text', text: '{"query":"מקלטים חיפה מרץ 2026"}' }],
        }),
      },
    },
  );

  assert.equal(q, 'מקלטים חיפה מרץ 2026');
});

test('rewriteQueryForRetrieval returns message when rewrite disabled', async () => {
  process.env.RAG_QUERY_REWRITE_ENABLED = '0';
  const q = await rewriteQueryForRetrieval({
    message: 'shelters Haifa',
    history: [{ role: 'user', content: 'prior' }],
  });
  assert.equal(q, 'shelters Haifa');
});

test('rewriteQueryForRetrieval skips API without history or systemHint', async () => {
  process.env.RAG_QUERY_REWRITE_ENABLED = '1';
  const q = await rewriteQueryForRetrieval({ message: 'standalone query' });
  assert.equal(q, 'standalone query');
});
