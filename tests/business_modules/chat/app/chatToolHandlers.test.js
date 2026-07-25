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
    assert.ok(result.includes('scores here'));
    assert.match(result, /^<<<UNTRUSTED_DATA label="tool:lookup_pbo">>>/);
  });

  it('blocks analyst tools for non-analyst', async () => {
    const result = await handleChatToolCall('list_geo_unknown', {}, {
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
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

describe('new deterministic tools', () => {
  it('get_report reports not-found with available dates', async () => {
    const result = await handleChatToolCall('get_report', { date: '1999-01-01' }, {
      reportData: {},
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /No report found for 1999-01-01/);
  });

  it('get_report_context with an unknown past date lists available dates', async () => {
    const result = await handleChatToolCall('get_report_context', { slice: 'full', date: '1999-01-01' }, {
      reportData: { display_view: 'operator', assessment: { report_scope: { id: 'north' } } },
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /No report found for 1999-01-01 \(scope=north\)/);
    assert.match(result, /Available dates:/);
  });

  it('get_component_evidence_bundle with an unknown past date lists available dates', async () => {
    const result = await handleChatToolCall(
      'get_component_evidence_bundle',
      { component: 'leadership', date: '1999-01-01' },
      {
        reportData: { display_view: 'operator', assessment: {} },
        isAnalyst: false,
        analystToolsEnabled: true,
        confirmActionsEnabled: true,
      },
    );
    assert.match(result, /No report found for 1999-01-01/);
  });

  it('get_report_context redacts a past report for non-analyst sessions', async () => {
    let redactedWith = null;
    const result = await handleChatToolCall('get_report_context', { slice: 'full', date: '1999-01-01' }, {
      reportData: { display_view: 'operator', assessment: {} },
      redactReportPayload: (raw, view) => { redactedWith = view; return raw; },
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    // Unknown date short-circuits before redaction — redactor must not have run.
    assert.equal(redactedWith, null);
    assert.match(result, /No report found/);
  });

  it('get_report_context returns the requested slice of today\'s report', async () => {
    const result = await handleChatToolCall('get_report_context', { slice: 'component', component: 'leadership' }, {
      reportData: {
        display_view: 'operator',
        assessment: {
          date: '2026-07-01',
          components: [
            { component_id: 'leadership', narrative: 'Mayors were visible in shelters.', confidence: 'medium' },
          ],
        },
      },
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /Component detail:/);
    assert.match(result, /leadership/);
  });

  it('signal_stats returns a no-match message for impossible filters', async () => {
    const result = await handleChatToolCall('signal_stats', { group_by: 'signal_type', date_from: '1999-01-01', date_to: '1999-01-02' }, {
      reportData: {},
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /No signals match/);
  });

  it('list_observations is analyst-gated', async () => {
    const result = await handleChatToolCall('list_observations', {}, {
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /analyst access/i);
  });

  it('onCitation fires for citation-bearing tools and a throwing callback is contained', async () => {
    const events = [];
    const ctx = {
      pboLookup: {},
      reportData: { assessment: { date: '2026-07-01' } },
      isAnalyst: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
      sourceArchive: {
        getBySourceId: () => ({
          source_id: 'db:1', title: 'T', source_type: 'news', body: 'Body',
        }),
        search: () => [],
      },
      onCitation: (p) => {
        events.push(p);
        throw new Error('listener bug');
      },
    };
    const result = await handleChatToolCall('get_source', { source_id: 'db:1' }, ctx);
    assert.equal(events.length, 1);
    assert.equal(events[0].tool, 'get_source');
    assert.equal(events[0].citations[0].source_id, 'db:1');
    assert.ok(result.length > 0, 'tool result must survive a throwing onCitation');
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
      toolName: 'propose_geo_unknown_update',
      params: { status: 'resolved' },
      summary: 'resolve entry',
    });
    const pending = store.getPending(id);
    assert.equal(pending.toolName, 'propose_geo_unknown_update');
    store.markConsumed(id);
    assert.ok(store.getPending(id).consumedAt);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('executePendingAction', () => {
  it('executes geo unknown update on confirm', async () => {
    const prev = process.env.RESILIENCE_ANALYST_EMAILS;
    process.env.RESILIENCE_ANALYST_EMAILS = 'analyst@test.com';
    let called = false;
    const geoUnknownReviewService = {
      updateStatus(id, { status }) {
        called = true;
        assert.equal(status, 'resolved');
      },
    };
    try {
      const result = await executePendingAction(
        {
          toolName: 'propose_geo_unknown_update',
          params: { id: 1, status: 'resolved' },
        },
        { userEmail: 'analyst@test.com', geoUnknownReviewService },
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
      const jsonBody = result.includes('<<<UNTRUSTED_DATA')
        ? result.replace(/^<<<UNTRUSTED_DATA[^>]*>>>\n/, '').replace(/\n<<<END_UNTRUSTED_DATA>>>$/, '')
        : result;
      const parsed = JSON.parse(jsonBody);
      assert.equal(parsed.source_id, 'md:2026-05-30:99');
      assert.ok(parsed.body_excerpt.length <= 2000);
      assert.ok(result.length < longBody.length);
    } finally {
      if (prev === undefined) delete process.env.CHAT_COMPRESS_TOOLS;
      else process.env.CHAT_COMPRESS_TOOLS = prev;
    }
  });
});
