import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runToolLoop } from '../../../../cross-cut-modules/llm/runToolLoop.js';

describe('runToolLoop abort', () => {
  it('throws AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Chat request timed out'));

    await assert.rejects(
      () => runToolLoop({
        client: {
          messages: {
            create: async () => {
              throw new Error('should not be called');
            },
          },
        },
        model: 'claude-haiku-4-5-20251001',
        system: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        executeTool: async () => 'ok',
        abortSignal: controller.signal,
      }),
      (err) => err.name === 'AbortError' && /timed out/.test(err.message),
    );
  });
});
