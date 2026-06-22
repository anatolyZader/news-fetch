import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { streamChatResponse } from '../../../../business_modules/chat/app/chatLlmOrchestrator.js';

describe('chat budget wiring', () => {
  it('passes chatSessionMaxUsd budget into agentKernel.run', async () => {
    const prev = process.env.CHAT_SESSION_MAX_USD;
    process.env.CHAT_SESSION_MAX_USD = '1.25';

    let capturedBudget = null;
    const agentKernel = {
      run: async (opts) => {
        capturedBudget = opts.budget ?? null;
        return {
          stopReason: 'end_turn',
          runId: 'run1',
          traceId: 'trace1',
          budget: capturedBudget,
          submitPayloads: [],
        };
      },
    };

    try {
      await streamChatResponse(
        'sys',
        {},
        [],
        () => {},
        null,
        { llmPort: {}, agentKernel },
      );
      assert.ok(capturedBudget, 'expected budget governor');
      assert.equal(capturedBudget.maxUsd, 1.25);
    } finally {
      if (prev == null) delete process.env.CHAT_SESSION_MAX_USD;
      else process.env.CHAT_SESSION_MAX_USD = prev;
    }
  });
});

