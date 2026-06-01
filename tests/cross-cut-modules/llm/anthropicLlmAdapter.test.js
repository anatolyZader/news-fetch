import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAnthropicLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';

function fakeClient() {
  const calls = { create: [], stream: [] };
  return {
    calls,
    messages: {
      create: (opts) => {
        calls.create.push(opts);
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1 }, stop_reason: 'end_turn' });
      },
      stream: (opts) => {
        calls.stream.push(opts);
        return { finalMessage: () => Promise.resolve({ content: [{ type: 'text', text: 'streamed' }] }) };
      },
    },
  };
}

describe('createAnthropicLlmPort', () => {
  it('passes createMessage opts through to the client verbatim and returns the raw message', async () => {
    const client = fakeClient();
    const port = createAnthropicLlmPort({ client });
    const opts = { model: 'claude-haiku-4-5-20251001', max_tokens: 100, system: 's', messages: [{ role: 'user', content: 'hi' }] };
    const res = await port.createMessage(opts);
    assert.deepEqual(client.calls.create[0], opts);
    assert.equal(res.stop_reason, 'end_turn');
    assert.equal(res.content[0].text, 'ok');
  });

  it('passes stream opts through and returns the raw stream object', async () => {
    const client = fakeClient();
    const port = createAnthropicLlmPort({ client });
    const opts = { model: 'claude-opus-4-6', max_tokens: 50, thinking: { type: 'adaptive' }, messages: [] };
    const stream = port.stream(opts);
    assert.deepEqual(client.calls.stream[0], opts, 'thinking and all opts preserved');
    const final = await stream.finalMessage();
    assert.equal(final.content[0].text, 'streamed');
  });

  it('runToolLoop pre-binds the client (caller does not pass client)', async () => {
    const client = fakeClient();
    const port = createAnthropicLlmPort({ client });
    const out = await port.runToolLoop({
      model: 'claude-haiku-4-5-20251001',
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      executeTool: () => 'unused',
    });
    assert.equal(client.calls.create.length, 1, 'tool loop used the bound client');
    assert.equal(out.stopReason, 'end_turn');
    assert.equal(out.lastAssistantText, 'ok');
  });

  it('stores defaultModel without applying it to createMessage', async () => {
    const client = fakeClient();
    const port = createAnthropicLlmPort({ client, defaultModel: 'claude-sonnet-4-6' });
    assert.equal(port.defaultModel, 'claude-sonnet-4-6');
    await port.createMessage({ model: 'claude-haiku-4-5-20251001', messages: [] });
    assert.equal(client.calls.create[0].model, 'claude-haiku-4-5-20251001', 'defaultModel not auto-injected');
  });
});
