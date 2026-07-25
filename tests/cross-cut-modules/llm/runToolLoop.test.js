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

  it('calls onToolStart before executeTool with round metadata', async () => {
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'x' } },
          { type: 'tool_use', id: 't2', name: 'search', input: { q: 'y' } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done.' }],
        usage: { input_tokens: 20, output_tokens: 10 },
      },
    ]);

    const toolStarts = [];
    let executeCalled = false;
    await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'go' }],
      tools: [{ name: 'lookup', input_schema: { type: 'object', properties: {} } }],
      agentKind: 'test',
      maxRounds: 3,
      onToolStart: (meta) => {
        toolStarts.push(meta);
      },
      executeTool: async () => {
        executeCalled = true;
        return 'tool output';
      },
    });

    assert.equal(toolStarts.length, 2);
    assert.equal(toolStarts[0].name, 'lookup');
    assert.equal(toolStarts[0].round, 1);
    assert.equal(toolStarts[0].maxRounds, 3);
    assert.equal(toolStarts[1].name, 'search');
    assert.ok(executeCalled);
  });

  it('surfaces stopReason=max_rounds when loop ends by maxRounds', async () => {
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'x' } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ]);

    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'go' }],
      tools: [{ name: 'lookup', input_schema: { type: 'object', properties: {} } }],
      agentKind: 'test',
      maxRounds: 0,
      executeTool: async () => 'tool output',
    });

    assert.equal(result.stopReason, 'max_rounds');
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

  it('compaction preserves multi-turn history including the current question', async () => {
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'a' } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done.' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ]);

    const history = [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'current question' },
    ];

    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: history,
      tools: [{ name: 'lookup', input_schema: { type: 'object', properties: {} } }],
      executeTool: async () => 'tool output',
      compactHistoryAfterRound: true,
      workingMemory: { snapshot: () => ({}) },
      budget: { snapshot: () => ({ spentUsd: 0 }) },
    });

    assert.equal(result.messages[0].content, 'first question');
    assert.equal(result.messages[1].content, 'first answer');
    assert.equal(result.messages[2].content, 'current question');
    assert.match(result.messages[3].content, /COMPACT WORKING MEMORY/);
  });

  it('streams deltas via onTextDelta and skips onTextBlock', async () => {
    const finalMsg = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'streamed answer' }],
      usage: { input_tokens: 5, output_tokens: 3 },
    };
    let aborted = false;
    const client = {
      messages: {
        create: async () => {
          throw new Error('create must not be called when onTextDelta is set');
        },
        stream: () => {
          const handlers = {};
          return {
            on(event, cb) { handlers[event] = cb; },
            abort() { aborted = true; },
            async finalMessage() {
              handlers.text?.('streamed ');
              handlers.text?.('answer');
              return finalMsg;
            },
          };
        },
      },
    };

    const deltas = [];
    const blocks = [];
    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      onTextDelta: (t) => deltas.push(t),
      onTextBlock: (t) => blocks.push(t),
      executeTool: async () => 'unused',
    });

    assert.deepEqual(deltas, ['streamed ', 'answer']);
    assert.deepEqual(blocks, []);
    assert.equal(result.lastAssistantText, 'streamed answer');
    assert.equal(aborted, false);
  });

  it('abort mid-stream surfaces AbortError and aborts the SDK stream', async () => {
    const controller = new AbortController();
    let sdkAborted = false;
    const client = {
      messages: {
        stream: () => ({
          on() {},
          abort() { sdkAborted = true; },
          async finalMessage() {
            controller.abort(new Error('Client disconnected'));
            throw new Error('stream interrupted');
          },
        }),
      },
    };

    await assert.rejects(
      runToolLoop({
        client,
        model: 'test-model',
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        abortSignal: controller.signal,
        onTextDelta: () => {},
        executeTool: async () => 'unused',
      }),
      (err) => err.name === 'AbortError' && /Client disconnected/.test(err.message),
    );
    assert.equal(sdkAborted, true);
  });

  it('abort between tool calls of a round skips the remaining tools', async () => {
    const controller = new AbortController();
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'first_tool', input: {} },
          { type: 'tool_use', id: 't2', name: 'second_tool', input: {} },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ]);

    const executed = [];
    await assert.rejects(
      runToolLoop({
        client,
        model: 'test-model',
        system: 'sys',
        messages: [{ role: 'user', content: 'go' }],
        tools: [{ name: 'first_tool', input_schema: { type: 'object', properties: {} } }],
        abortSignal: controller.signal,
        executeTool: async (name) => {
          executed.push(name);
          controller.abort(new Error('Client disconnected'));
          return 'out';
        },
      }),
      (err) => err.name === 'AbortError',
    );
    assert.deepEqual(executed, ['first_tool'], 'second tool must not run after abort');
  });

  it('falls back to messages.create when onTextDelta is absent', async () => {
    let createCalls = 0;
    const client = {
      messages: {
        create: async () => {
          createCalls++;
          return {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          };
        },
        stream: () => {
          throw new Error('stream must not be called without onTextDelta');
        },
      },
    };
    const result = await runToolLoop({
      client,
      model: 'test-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      executeTool: async () => 'unused',
    });
    assert.equal(createCalls, 1);
    assert.equal(result.lastAssistantText, 'ok');
  });

  it('forwards cached system blocks on each model call', async () => {
    const systems = [];
    const client = {
      messages: {
        create: async (opts) => {
          systems.push(opts.system);
          return {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          };
        },
      },
    };
    const prevMaster = process.env.LLM_PROMPT_CACHE;
    const prevChat = process.env.CHAT_PROMPT_CACHE;
    process.env.LLM_PROMPT_CACHE = '1';
    process.env.CHAT_PROMPT_CACHE = '1';
    try {
      await runToolLoop({
        client,
        model: 'test-model',
        system: { stable: 'S'.repeat(3000), dynamic: 'report context' },
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        agentKind: 'chat',
        callContext: { feature: 'chat' },
        executeTool: async () => 'unused',
      });
      assert.equal(systems.length, 1);
      assert.ok(Array.isArray(systems[0]));
      assert.equal(systems[0][0].cache_control?.type, 'ephemeral');
    } finally {
      if (prevMaster == null) delete process.env.LLM_PROMPT_CACHE;
      else process.env.LLM_PROMPT_CACHE = prevMaster;
      if (prevChat == null) delete process.env.CHAT_PROMPT_CACHE;
      else process.env.CHAT_PROMPT_CACHE = prevChat;
    }
  });
});
