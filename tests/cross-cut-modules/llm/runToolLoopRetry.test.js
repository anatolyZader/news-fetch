import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runToolLoop } from '../../../cross-cut-modules/llm/runToolLoop.js';
import { isTransientLlmError } from '../../../cross-cut-modules/llm/withLlmRetry.js';

function flakyClient({ failures, error, finalMessage }) {
  let calls = 0;
  return {
    calls: () => calls,
    messages: {
      create: async () => {
        calls++;
        if (calls <= failures) throw error;
        return finalMessage;
      },
    },
  };
}

const FINAL = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'ok' }],
  usage: { input_tokens: 1, output_tokens: 1 },
};

describe('runToolLoop retryModelCall', () => {
  it('retries a transient 529/overloaded failure and completes the round', async () => {
    const err = Object.assign(new Error('Overloaded'), { status: 529 });
    const client = flakyClient({ failures: 1, error: err, finalMessage: FINAL });

    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'go' }],
      tools: [],
      agentKind: 'test',
      executeTool: async () => 'unused',
      retryModelCall: { retries: 2, waitMs: () => 0 },
    });

    assert.equal(client.calls(), 2);
    assert.equal(result.lastAssistantText, 'ok');
  });

  it('does not retry deterministic errors', async () => {
    const err = Object.assign(new Error('invalid_request'), { status: 400 });
    const client = flakyClient({ failures: 99, error: err, finalMessage: FINAL });

    await assert.rejects(
      runToolLoop({
        client,
        model: 'test-model',
        system: 'sys',
        messages: [{ role: 'user', content: 'go' }],
        tools: [],
        agentKind: 'test',
        executeTool: async () => 'unused',
        retryModelCall: { retries: 3, waitMs: () => 0 },
      }),
      /invalid_request/,
    );
    assert.equal(client.calls(), 1);
  });

  it('without retryModelCall a transient failure propagates immediately', async () => {
    const err = Object.assign(new Error('rate limit'), { status: 429 });
    const client = flakyClient({ failures: 1, error: err, finalMessage: FINAL });

    await assert.rejects(
      runToolLoop({
        client,
        model: 'test-model',
        system: 'sys',
        messages: [{ role: 'user', content: 'go' }],
        tools: [],
        agentKind: 'test',
        executeTool: async () => 'unused',
      }),
      /rate limit/,
    );
    assert.equal(client.calls(), 1);
  });
});

describe('isTransientLlmError', () => {
  it('classifies provider/network failures as transient', () => {
    assert.equal(isTransientLlmError(Object.assign(new Error('x'), { status: 429 })), true);
    assert.equal(isTransientLlmError(Object.assign(new Error('x'), { status: 503 })), true);
    assert.equal(isTransientLlmError(Object.assign(new Error('x'), { code: 'ECONNRESET' })), true);
    assert.equal(isTransientLlmError(new Error('Request timed out')), true);
  });

  it('never retries aborts or deterministic errors', () => {
    const abort = new Error('stopped');
    abort.name = 'AbortError';
    assert.equal(isTransientLlmError(abort), false);
    assert.equal(isTransientLlmError(Object.assign(new Error('bad request'), { status: 400 })), false);
    assert.equal(isTransientLlmError(null), false);
  });
});
