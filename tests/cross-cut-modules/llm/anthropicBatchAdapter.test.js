import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAnthropicBatchAdapter } from '../../../cross-cut-modules/llm/anthropicBatchAdapter.js';

function mockBatchClient() {
  let retrieveCount = 0;
  return {
    messages: {
      batches: {
        create: async ({ requests }) => {
          assert.equal(requests.length, 1);
          return { id: 'batch_123' };
        },
        retrieve: async (batchId) => {
          retrieveCount++;
          if (retrieveCount < 2) {
            return { processing_status: 'in_progress' };
          }
          return { processing_status: 'ended' };
        },
        results: async function* () {
          yield {
            custom_id: 'req-1',
            result: {
              type: 'succeeded',
              message: {
                content: [{ type: 'text', text: '[]' }],
                usage: { input_tokens: 100, output_tokens: 10 },
                stop_reason: 'end_turn',
              },
            },
          };
        },
      },
    },
  };
}

describe('anthropicBatchAdapter', () => {
  it('submits, polls, and parses succeeded batch results', async () => {
    const adapter = createAnthropicBatchAdapter({ client: mockBatchClient() });
    const results = await adapter.runBatch([
      {
        custom_id: 'req-1',
        params: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{ role: 'user', content: 'test' }],
        },
        callContext: { feature: 'extract' },
      },
    ], { intervalMs: 1 });

    const item = results.get('req-1');
    assert.equal(item.ok, true);
    assert.equal(item.message.content[0].text, '[]');
  });

  it('marks errored batch items as not ok', async () => {
    const client = {
      messages: {
        batches: {
          create: async () => ({ id: 'batch_err' }),
          retrieve: async () => ({ processing_status: 'ended' }),
          results: async function* () {
            yield {
              custom_id: 'req-2',
              result: { type: 'errored', error: { message: 'rate_limit' } },
            };
          },
        },
      },
    };
    const adapter = createAnthropicBatchAdapter({ client });
    const results = await adapter.runBatch([
      { custom_id: 'req-2', params: { model: 'claude-haiku-4-5-20251001' } },
    ], { intervalMs: 1 });

    const item = results.get('req-2');
    assert.equal(item.ok, false);
    assert.match(item.error, /rate_limit/);
  });
});
