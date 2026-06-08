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

  it('list_attention_items returns ranked items from assessment', async () => {
    const result = await handleChatToolCall('list_attention_items', { limit: 5 }, {
      reportData: {
        assessment: {
          date: '2026-05-30',
          components: [],
          operator_recommendations: [],
        },
      },
    });
    assert.equal(typeof result, 'string');
  });

  it('get_decision_brief returns brief JSON', async () => {
    const result = await handleChatToolCall('get_decision_brief', {}, {
      reportData: {
        assessment: {
          decision_brief: { summary: 'Focus on field corroboration.', priority_items: [] },
        },
      },
    });
    assert.match(result, /Focus on field/);
  });

  it('list_operator_recommendations filters pending', async () => {
    const result = await handleChatToolCall('list_operator_recommendations', { status: 'pending' }, {
      reportData: {
        assessment: {
          operator_recommendations: [{
            id: 'rec:test',
            pattern_code: 'active_rumor_cluster',
            level: 'watch',
            status: 'pending',
            recommended_action: { type: 'monitor_rumors' },
          }],
        },
      },
    });
    assert.match(result, /rec:test/);
    assert.match(result, /monitor_rumors/);
  });

  it('propose_operator_recommendation available for operators', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chat-pending-op-'));
    const store = createChatPendingActionStore(join(dir, 'test.sqlite'));
    const proposed = [];
    const result = await handleChatToolCall(
      'propose_operator_recommendation',
      { recommendation_id: 'rec:test', action: 'acknowledge', rationale: 'done' },
      {
        isAnalyst: false,
        analystToolsEnabled: true,
        confirmActionsEnabled: true,
        pendingActionStore: store,
        ownerUid: 'u1',
        sessionId: 's1',
        onActionProposed: (p) => proposed.push(p),
      },
    );
    assert.match(result, /Action proposed/);
    assert.equal(proposed.length, 1);
    rmSync(dir, { recursive: true, force: true });
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

  it('compresses long get_source responses for the LLM', async () => {
    const prev = process.env.CHAT_COMPRESS_TOOLS;
    process.env.CHAT_COMPRESS_TOOLS = '1';
    try {
      const longBody = 'Lorem ipsum '.repeat(800);
      const sourceArchive = {
        getBySourceId: () => ({
          source_id: 'md:2026-05-30:99',
          title: 'Long article',
          source_type: 'news',
          source_url: 'https://example.com/a',
          body: longBody,
        }),
      };
      const result = await handleChatToolCall('get_source', { source_id: 'md:2026-05-30:99' }, {
        sourceArchive,
        economyOverride: 'default',
      });
      const parsed = JSON.parse(result);
      assert.equal(parsed.source_id, 'md:2026-05-30:99');
      assert.ok(parsed.body_excerpt.length <= 2000);
      assert.ok(result.length < longBody.length);
    } finally {
      if (prev === undefined) delete process.env.CHAT_COMPRESS_TOOLS;
      else process.env.CHAT_COMPRESS_TOOLS = prev;
    }
  });
});
