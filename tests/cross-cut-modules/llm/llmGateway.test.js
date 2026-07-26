import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createAnthropicLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { createLlmGateway } from '../../../cross-cut-modules/llm/llmGateway.js';
import { readJsonlRecords } from '../../../cross-cut-modules/log/infrastructure/jsonlLog.js';
import { resolveLlmInvocationsPath } from '../../../cross-cut-modules/llm/llmInvocationLog.js';

function fakeClient() {
  return {
    messages: {
      create: (_opts) => Promise.resolve({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20 },
        stop_reason: 'end_turn',
      }),
      stream: (_opts) => ({
        finalMessage: () => Promise.resolve({
          content: [{ type: 'text', text: 'streamed' }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: 'end_turn',
        }),
      }),
    },
  };
}

describe('createLlmGateway', () => {
  it('logs invocation on createMessage with feature context', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-gw-'));
    const prev = process.env.LLM_INVOCATIONS_PATH;
    process.env.LLM_INVOCATIONS_PATH = join(dir, 'invocations.jsonl');

    try {
      const port = createLlmGateway(createAnthropicLlmPort({ client: fakeClient() }));
      await port.createMessage({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
        callContext: { feature: 'chat', purpose: 'test-call' },
      });

      const rows = [...readJsonlRecords(resolveLlmInvocationsPath())];
      assert.equal(rows.length, 1);
      assert.equal(rows[0].feature, 'chat');
      assert.equal(rows[0].inputTokens, 100);
      assert.equal(rows[0].cachedInputTokens, 20);
      assert.ok(rows[0].costUsd > 0);
    } finally {
      if (prev == null) delete process.env.LLM_INVOCATIONS_PATH;
      else process.env.LLM_INVOCATIONS_PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logs promptCacheApplied on tool-loop rounds', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-gw-tool-'));
    const prevPath = process.env.LLM_INVOCATIONS_PATH;
    const prevCache = process.env.LLM_PROMPT_CACHE;
    const prevChatCache = process.env.CHAT_PROMPT_CACHE;
    process.env.LLM_INVOCATIONS_PATH = join(dir, 'invocations.jsonl');
    process.env.LLM_PROMPT_CACHE = '1';
    process.env.CHAT_PROMPT_CACHE = '1';

    const client = {
      messages: {
        create: async () => ({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 100 },
        }),
      },
    };

    try {
      const port = createLlmGateway(createAnthropicLlmPort({ client }));
      await port.runToolLoop({
        model: 'claude-haiku-4-5-20251001',
        system: { stable: 'x'.repeat(2500), dynamic: 'ctx' },
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        agentKind: 'chat',
        callContext: { feature: 'chat' },
        executeTool: async () => 'unused',
      });

      const rows = [...readJsonlRecords(resolveLlmInvocationsPath())];
      assert.equal(rows.length, 1);
      assert.equal(rows[0].purpose, 'chat:round-0');
      assert.equal(rows[0].promptCacheApplied, true);
      assert.equal(rows[0].cachedInputTokens, 100);
    } finally {
      if (prevPath == null) delete process.env.LLM_INVOCATIONS_PATH;
      else process.env.LLM_INVOCATIONS_PATH = prevPath;
      if (prevCache == null) delete process.env.LLM_PROMPT_CACHE;
      else process.env.LLM_PROMPT_CACHE = prevCache;
      if (prevChatCache == null) delete process.env.CHAT_PROMPT_CACHE;
      else process.env.CHAT_PROMPT_CACHE = prevChatCache;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('opens circuit breaker after consecutive provider failures', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-gw-breaker-'));
    const prevPath = process.env.LLM_INVOCATIONS_PATH;
    const prevThreshold = process.env.LLM_BREAKER_THRESHOLD;
    const prevCooldown = process.env.LLM_BREAKER_COOLDOWN_MS;

    process.env.LLM_INVOCATIONS_PATH = join(dir, 'invocations.jsonl');
    process.env.LLM_BREAKER_THRESHOLD = '2';
    process.env.LLM_BREAKER_COOLDOWN_MS = '60000';

    let attempts = 0;
    const failingClient = {
      messages: {
        create: async () => {
          attempts += 1;
          const err = new Error('rate limited');
          err.status = 429;
          err.statusCode = 429;
          throw err;
        },
      },
    };

    try {
      const port = createLlmGateway(createAnthropicLlmPort({ client: failingClient }));

      const baseCall = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
        callContext: { feature: 'chat', purpose: 'breaker-test' },
      };

      await assert.rejects(() => port.createMessage(baseCall), (err) => err?.status === 429 || err?.statusCode === 429);
      await assert.rejects(() => port.createMessage(baseCall), (err) => err?.status === 429 || err?.statusCode === 429);

      assert.equal(attempts, 2);

      await assert.rejects(
        () => port.createMessage(baseCall),
        (err) => err?.code === 'llm_circuit_open',
      );

      assert.equal(attempts, 2, 'expected breaker fast-fail without calling provider');
    } finally {
      if (prevPath == null) delete process.env.LLM_INVOCATIONS_PATH;
      else process.env.LLM_INVOCATIONS_PATH = prevPath;
      if (prevThreshold == null) delete process.env.LLM_BREAKER_THRESHOLD;
      else process.env.LLM_BREAKER_THRESHOLD = prevThreshold;
      if (prevCooldown == null) delete process.env.LLM_BREAKER_COOLDOWN_MS;
      else process.env.LLM_BREAKER_COOLDOWN_MS = prevCooldown;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createLlmGateway claude-cli transport', () => {
  function cliInnerPort() {
    const message = {
      content: [{ type: 'text', text: 'cli-ok' }],
      usage: { input_tokens: 200, output_tokens: 30 },
      stop_reason: 'end_turn',
    };
    return {
      transport: 'claude-cli',
      createMessage: async () => message,
      stream: async () => ({ finalMessage: () => Promise.resolve(message) }),
      runToolLoop: async () => ({ lastAssistantText: 'x' }),
    };
  }

  it('records $0 + transport on createMessage invocations and onUsage payloads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-gw-cli-'));
    const prev = process.env.LLM_INVOCATIONS_PATH;
    process.env.LLM_INVOCATIONS_PATH = join(dir, 'invocations.jsonl');

    try {
      const port = createLlmGateway(cliInnerPort());
      assert.equal(port.transport, 'claude-cli');

      const payloads = [];
      await port.createMessage({
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        callContext: { feature: 'extract', purpose: 'cli-call' },
        onUsage: (p) => payloads.push(p),
      });

      const rows = [...readJsonlRecords(resolveLlmInvocationsPath())];
      assert.equal(rows.length, 1);
      assert.equal(rows[0].costUsd, 0);
      assert.equal(rows[0].transport, 'claude-cli');
      assert.equal(rows[0].inputTokens, 200);

      assert.equal(payloads.length, 1);
      assert.equal(payloads[0].costUsd, 0);
      assert.equal(payloads[0].transport, 'claude-cli');
    } finally {
      if (prev == null) delete process.env.LLM_INVOCATIONS_PATH;
      else process.env.LLM_INVOCATIONS_PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records $0 + transport on the stream finalMessage path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-gw-cli-stream-'));
    const prev = process.env.LLM_INVOCATIONS_PATH;
    process.env.LLM_INVOCATIONS_PATH = join(dir, 'invocations.jsonl');

    try {
      const port = createLlmGateway(cliInnerPort());
      const payloads = [];
      const stream = await port.stream({
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        callContext: { feature: 'extract', purpose: 'cli-stream' },
        onUsage: (p) => payloads.push(p),
      });
      await stream.finalMessage();

      const rows = [...readJsonlRecords(resolveLlmInvocationsPath())];
      assert.equal(rows.length, 1);
      assert.equal(rows[0].costUsd, 0);
      assert.equal(rows[0].transport, 'claude-cli');
      assert.equal(payloads[0].costUsd, 0);
      assert.equal(payloads[0].transport, 'claude-cli');
    } finally {
      if (prev == null) delete process.env.LLM_INVOCATIONS_PATH;
      else process.env.LLM_INVOCATIONS_PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createLlmGateway dynamic transport (limit fallback)', () => {
  it('bills at real prices once the inner port stops reporting claude-cli', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-gw-flip-'));
    const prev = process.env.LLM_INVOCATIONS_PATH;
    process.env.LLM_INVOCATIONS_PATH = join(dir, 'invocations.jsonl');

    try {
      let onCli = true;
      const message = {
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1000, output_tokens: 100 },
        stop_reason: 'end_turn',
      };
      const inner = {
        get transport() { return onCli ? 'claude-cli' : undefined; },
        createMessage: async () => message,
      };
      const port = createLlmGateway(inner);
      const payloads = [];
      const req = {
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        callContext: { feature: 'extract', purpose: 'flip' },
        onUsage: (p) => payloads.push(p),
      };

      await port.createMessage(req);       // subscription-billed
      onCli = false;                       // simulate sticky API fallback
      await port.createMessage(req);       // metered

      assert.equal(payloads[0].costUsd, 0);
      assert.equal(payloads[0].transport, 'claude-cli');
      assert.ok(payloads[1].costUsd > 0);
      assert.equal(payloads[1].transport, undefined);
      assert.equal(port.transport, undefined); // getter follows the inner port
    } finally {
      if (prev == null) delete process.env.LLM_INVOCATIONS_PATH;
      else process.env.LLM_INVOCATIONS_PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
