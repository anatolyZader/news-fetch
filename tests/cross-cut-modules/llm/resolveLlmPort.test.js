import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveLlmPort } from '../../../cross-cut-modules/llm/resolveLlmPort.js';

function fakeClient() {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 3, output_tokens: 2 },
        stop_reason: 'end_turn',
      }),
      stream: async () => ({
        finalMessage: async () => ({
          content: [{ type: 'text', text: 'streamed' }],
          usage: { input_tokens: 5, output_tokens: 4 },
          stop_reason: 'end_turn',
        }),
        [Symbol.asyncIterator]: async function* () {},
      }),
    },
  };
}

describe('resolveLlmPort', () => {
  it('returns injected llmPort unchanged', async () => {
    const port = {
      createMessage: async () => ({ content: [{ type: 'text', text: 'direct' }] }),
      stream: async () => ({ finalMessage: async () => ({ content: [] }) }),
      runToolLoop: async () => ({}),
    };
    const resolved = resolveLlmPort({ llmPort: port });
    assert.equal(resolved, port);
    const msg = await resolved.createMessage({ model: 'test', messages: [] });
    assert.equal(msg.content[0].text, 'direct');
  });

  it('bridges opts.client mock through createMessage', async () => {
    const port = resolveLlmPort({ client: fakeClient() });
    const msg = await port.createMessage({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(msg.content[0].text, 'ok');
    assert.equal(msg.stop_reason, 'end_turn');
  });

  it('bridges opts.client mock through stream.finalMessage', async () => {
    const port = resolveLlmPort({ client: fakeClient() });
    const stream = await port.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const msg = await stream.finalMessage();
    assert.equal(msg.content[0].text, 'streamed');
  });
});
