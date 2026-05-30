import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleChatToolCall } from '../../../../business_modules/chat/app/chatToolHandlers.js';
import { createChatPendingActionStore } from '../../../../business_modules/chat/infrastructure/chatPendingActionStore.js';
import { executePendingAction } from '../../../../business_modules/chat/app/executePendingAction.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('chatToolHandlers', () => {
  it('lookup_pbo returns data from pboLookup', async () => {
    const result = await handleChatToolCall('lookup_pbo', { municipality: 'Haifa' }, {
      pboLookup: { Haifa: 'scores here' },
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
      reportData: {},
    });
    assert.equal(result, 'scores here');
  });

  it('blocks analyst tools for non-analyst', async () => {
    const result = await handleChatToolCall('list_validation_queue', { date: '2026-05-30' }, {
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /analyst access/i);
  });

  it('explain_validation_item requires analyst', async () => {
    const result = await handleChatToolCall(
      'explain_validation_item',
      { date: '2026-05-30', article_key: 'x' },
      { isAnalyst: false, analystToolsEnabled: true, confirmActionsEnabled: true },
    );
    assert.match(result, /analyst access/i);
  });
});

describe('chatPendingActionStore', () => {
  it('creates and consumes pending actions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chat-pending-'));
    const dbPath = join(dir, 'test.sqlite');
    const store = createChatPendingActionStore(dbPath);
    const { id } = store.createPending({
      ownerUid: 'u1',
      sessionId: 's1',
      toolName: 'propose_validation_decision',
      params: { action: 'skip' },
      summary: 'skip item',
    });
    const pending = store.getPending(id);
    assert.equal(pending.toolName, 'propose_validation_decision');
    store.markConsumed(id);
    assert.ok(store.getPending(id).consumedAt);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('executePendingAction', () => {
  it('executes validation decision on confirm', async () => {
    const prev = process.env.RESILIENCE_ANALYST_EMAILS;
    process.env.RESILIENCE_ANALYST_EMAILS = 'analyst@test.com';
    let called = false;
    const validationReviewService = {
      submitDecision(date, scope, key, reviewer, { action }) {
        called = true;
        assert.equal(action, 'skip');
        assert.equal(reviewer.email, 'analyst@test.com');
      },
    };
    try {
      const result = await executePendingAction(
        {
          toolName: 'propose_validation_decision',
          params: { date: '2026-05-30', scope: 'national', article_key: 'abc', action: 'skip' },
        },
        { userEmail: 'analyst@test.com', validationReviewService },
      );
      assert.equal(called, true);
      assert.equal(result.ok, true);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_ANALYST_EMAILS;
      else process.env.RESILIENCE_ANALYST_EMAILS = prev;
    }
  });
});
