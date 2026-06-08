import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

    const auditDir = mkdtempSync(join(tmpdir(), 'run-tool-loop-test-'));
    const toolsCalled = [];
    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'go' }],
      tools: [{ name: 'lookup', input_schema: { type: 'object', properties: {} } }],
      agentKind: 'test',
      auditLogPath: join(auditDir, 'audit.jsonl'),
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

  it('invokes onUsage after each model call', async () => {
    const client = fakeClient([
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    ]);
    const usages = [];
    await runToolLoop({
      client,
      model: 'claude-haiku-4-5-20251001',
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      agentKind: 'test',
      onUsage: (p) => usages.push(p),
      executeTool: async () => 'unused',
    });
    assert.equal(usages.length, 1);
    assert.equal(usages[0].label, 'test:round-0');
    assert.equal(usages[0].model, 'claude-haiku-4-5-20251001');
  });

  it('compacts message history after tool rounds when enabled', async () => {
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'a' } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't2', name: 'lookup', input: { q: 'b' } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done.' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ]);

    const workingMemory = {
      snapshot: () => ({ 'tool:lookup': 'summary of prior hits' }),
    };

    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'go' }],
      tools: [{ name: 'lookup', input_schema: { type: 'object', properties: {} } }],
      executeTool: async () => 'tool output',
      compactHistoryAfterRound: true,
      workingMemory,
      budget: { snapshot: () => ({ spentUsd: 0.1 }) },
    });

    assert.equal(result.lastAssistantText, 'Done.');
    assert.ok(result.messages.length <= 5, `expected bounded history, got ${result.messages.length}`);
    assert.match(result.messages[1].content, /COMPACT WORKING MEMORY/);
  });
});
