import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runToolLoop } from '../../../cross-cut-modules/llm/runToolLoop.js';

function fakeClient(script) {
  let callIndex = 0;
  return {
    messages: {
      create: async () => {
        const step = script[callIndex] ?? script[script.length - 1];
        callIndex++;
        return step;
      },
    },
  };
}

describe('runToolLoop', () => {
  it('executes tools then returns final text', async () => {
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'x' } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Final answer.' }],
        usage: { input_tokens: 20, output_tokens: 10 },
      },
    ]);

    const toolsCalled = [];
    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'go' }],
      tools: [{ name: 'lookup', input_schema: { type: 'object', properties: {} } }],
      agentKind: 'test',
      auditLogPath: '/tmp/run-tool-loop-test-audit.jsonl',
      executeTool: async (name, input) => {
        toolsCalled.push({ name, input });
        return 'tool output';
      },
    });

    assert.equal(toolsCalled.length, 1);
    assert.equal(toolsCalled[0].name, 'lookup');
    assert.equal(result.lastAssistantText, 'Final answer.');
    assert.ok(result.messages.length >= 3);
  });

  it('stops on end_turn without tools', async () => {
    const client = fakeClient([
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Direct reply' }],
      },
    ]);

    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      executeTool: async () => 'unused',
    });

    assert.equal(result.lastAssistantText, 'Direct reply');
  });
});
