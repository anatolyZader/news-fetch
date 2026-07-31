import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleChatToolCall } from '../../../../business_modules/chat/app/chatToolHandlers.js';
import { createChatPendingActionStore } from '../../../../business_modules/chat/infrastructure/chatPendingActionStore.js';
import { executePendingAction } from '../../../../business_modules/chat/app/executePendingAction.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('chatToolHandlers', () => {
  it('lookup_pbo returns data from pboLookup', async () => {
    const result = await handleChatToolCall('lookup_pbo', { municipality: 'Haifa' }, {
      pboLookup: { Haifa: 'scores here' },
      richTools: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
      reportData: {},
    });
    assert.ok(result.includes('scores here'));
    assert.match(result, /^<<<UNTRUSTED_DATA label="tool:lookup_pbo">>>/);
  });

  it('blocks analyst tools for non-analyst', async () => {
    const result = await handleChatToolCall('list_geo_unknown', {}, {
      richTools: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /listed account/i);
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
        richTools: false,
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

describe('lookup_pbo dashboard source', () => {
  const dashboard = {
    componentsOrder: ['narrative', 'leadership'],
    componentNames: { en: {}, he: {} },
    municipalities: ['חורפיש', 'כרמיאל'],
    days: [
      {
        date: '2026-04-10',
        municipalities: [
          { name: 'חורפיש', components: { narrative: { avg: 0.5, texts: ['old note'] }, leadership: { avg: null, texts: [] } } },
        ],
      },
      {
        date: '2026-04-18',
        municipalities: [
          { name: 'חורפיש', components: { narrative: { avg: 0.81, texts: ['מתמודדים'] }, leadership: { avg: 1, texts: ['נוכחות'] } } },
        ],
      },
    ],
  };
  const baseCtx = {
    pboLookup: {},
    reportData: { assessment: { date: '2026-05-23' } },
    getMunicipalityDashboard: () => dashboard,
    richTools: false,
    analystToolsEnabled: true,
    confirmActionsEnabled: true,
  };

  it('serves an exact-date match labeled with the PBO report date', async () => {
    const result = await handleChatToolCall('lookup_pbo', { municipality: 'חורפיש', date: '2026-04-18' }, baseCtx);
    assert.match(result, /PBO report date 2026-04-18 — state this date when answering/);
    assert.match(result, /narrative: 81% — מתמודדים/);
    assert.match(result, /leadership: 100% — נוכחות/);
  });

  it('without a date, falls back to the latest collection with a "last collected" label', async () => {
    const result = await handleChatToolCall('lookup_pbo', { municipality: 'חורפיש' }, baseCtx);
    assert.match(result, /last collected 2026-04-18, NOT current/);
    assert.match(result, /narrative: 81%/);
  });

  it('explicit-date miss lists the covered dates', async () => {
    const result = await handleChatToolCall('lookup_pbo', { municipality: 'חורפיש', date: '2026-03-01' }, baseCtx);
    assert.match(result, /PBO reports exist only for: 2026-04-10, 2026-04-18/);
  });
});

describe('lookup_pbo date awareness', () => {
  const baseCtx = {
    pboLookup: {},
    reportData: { assessment: { date: '2026-05-23' } },
    richTools: false,
    analystToolsEnabled: true,
    confirmActionsEnabled: true,
  };

  it('embedded report index still wins when it has the municipality', async () => {
    const result = await handleChatToolCall('lookup_pbo', { municipality: 'Haifa' }, {
      ...baseCtx,
      pboLookup: { Haifa: 'embedded scores' },
    });
    assert.ok(result.includes('embedded scores'));
  });

  it('a miss names the target date and points at PBO coverage instead of a bare empty list', async () => {
    const result = await handleChatToolCall('lookup_pbo', { municipality: 'Nowhere', date: '1888-01-01' }, baseCtx);
    assert.match(result, /No PBO data for "Nowhere" on 1888-01-01/);
    assert.match(result, /PBO reports exist only for:|No PBO signal bundles exist on disk/);
  });
});

describe('empty-layer honesty', () => {
  const gates = { richTools: false, analystToolsEnabled: true, confirmActionsEnabled: true, pboLookup: {} };

  it('attention items: empty list says the layer ran', async () => {
    const result = await handleChatToolCall('list_attention_items', {}, {
      ...gates,
      reportData: { assessment: { date: '2026-05-30', components: [] } },
    });
    assert.match(result, /nothing was flagged for this assessment \(the attention layer did run\)/);
  });

  it('recommendations: absent field vs empty list are distinguished', async () => {
    const absent = await handleChatToolCall('list_operator_recommendations', {}, {
      ...gates,
      reportData: { assessment: { date: '2026-05-30', components: [] } },
    });
    assert.match(absent, /not generated for this report \(feature off at assess time\)/);

    const empty = await handleChatToolCall('list_operator_recommendations', { status: 'pending' }, {
      ...gates,
      reportData: { assessment: { date: '2026-05-30', components: [], operator_recommendations: [] } },
    });
    assert.match(empty, /status=pending — the layer ran, none matched/);
  });
});

describe('new deterministic tools', () => {
  it('get_report reports not-found with available dates', async () => {
    const result = await handleChatToolCall('get_report', { date: '1999-01-01' }, {
      reportData: {},
      richTools: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /No report found for 1999-01-01/);
  });

  it('get_report_context with an unknown past date lists available dates', async () => {
    const result = await handleChatToolCall('get_report_context', { slice: 'full', date: '1999-01-01' }, {
      reportData: { display_view: 'operator', assessment: { report_scope: { id: 'north' } } },
      richTools: false,
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
        richTools: false,
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
      richTools: false,
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
      richTools: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /Component detail:/);
    assert.match(result, /leadership/);
  });

  it('signal_stats returns a no-match message for impossible filters', async () => {
    const result = await handleChatToolCall('signal_stats', { group_by: 'signal_type', date_from: '1999-01-01', date_to: '1999-01-02' }, {
      reportData: {},
      richTools: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /No signals match/);
  });

  it('list_observations is analyst-gated', async () => {
    const result = await handleChatToolCall('list_observations', {}, {
      richTools: false,
      analystToolsEnabled: true,
      confirmActionsEnabled: true,
    });
    assert.match(result, /listed account/i);
  });

  it('onCitation fires for citation-bearing tools and a throwing callback is contained', async () => {
    const events = [];
    const ctx = {
      pboLookup: {},
      reportData: { assessment: { date: '2026-07-01' } },
      richTools: false,
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

describe('coverage / catalog / profile / search tools', () => {
  const gates = { richTools: false, analystToolsEnabled: true, confirmActionsEnabled: true, pboLookup: {} };
  const dashboard = {
    componentsOrder: ['narrative', 'leadership'],
    componentNames: { en: {}, he: {} },
    municipalities: ['חורפיש', 'כרמיאל'],
    days: [
      {
        date: '2026-04-10',
        municipalities: [
          { name: 'חורפיש', components: { narrative: { avg: 0.5, texts: ['old note'] } } },
        ],
      },
      {
        date: '2026-04-18',
        municipalities: [
          { name: 'חורפיש', components: { narrative: { avg: 0.81, texts: ['מתמודדים'] } } },
        ],
      },
    ],
  };

  it('get_data_coverage renders all three sections', async () => {
    const result = await handleChatToolCall('get_data_coverage', {}, {
      ...gates,
      reportData: {},
      getMunicipalityDashboard: () => dashboard,
    });
    assert.match(result, /Report dates by scope:/);
    assert.match(result, /Signal dates by source type:/);
    assert.match(result, /PBO collections:/);
    assert.match(result, /dashboard days: 2026-04-10, 2026-04-18/);
  });

  it('describe_signal_type includes routing edges', async () => {
    const result = await handleChatToolCall('describe_signal_type', { signal_type: 'compliance_enter_shelter' }, {
      ...gates,
      reportData: {},
    });
    assert.match(result, /type: compliance_enter_shelter/);
    assert.match(result, /- lifesaving_behavior: role=primary polarity=\+/);
  });

  it('get_municipality_profile serves the latest PBO state with an honest date label', async () => {
    const result = await handleChatToolCall(
      'get_municipality_profile',
      { municipality: 'חורפיש', date_from: '1999-01-01', date_to: '1999-01-02' },
      { ...gates, reportData: {}, getMunicipalityDashboard: () => dashboard },
    );
    assert.match(result, /Municipality profile: חורפיש/);
    assert.match(result, /last collected 2026-04-18, NOT current/);
    assert.match(result, /PBO dates covered: 2026-04-10, 2026-04-18/);
    assert.match(result, /Signals: none matched/);
  });

  it('get_municipality_profile total miss lists known municipalities', async () => {
    const result = await handleChatToolCall(
      'get_municipality_profile',
      { municipality: 'Nowhereville', date_from: '1999-01-01', date_to: '1999-01-02' },
      { ...gates, reportData: {}, getMunicipalityDashboard: () => dashboard },
    );
    assert.match(result, /No PBO data or signals found for "Nowhereville"/);
    assert.match(result, /חורפיש/);
  });

  it('search_reports requires a query and reports misses', async () => {
    const missing = await handleChatToolCall('search_reports', {}, { ...gates, reportData: {} });
    assert.match(missing, /query is required/);
    const noHit = await handleChatToolCall('search_reports', { query: 'zzz-nothing-zzz', limit: 2 }, {
      ...gates,
      reportData: {},
    });
    assert.match(noHit, /No report text matches "zzz-nothing-zzz"/);
  });

  it('search_reports redacts for non-analyst sessions', async () => {
    // daily_reports/ is gitignored — seed a temp fixture so CI invokes redact.
    const reportsDir = mkdtempSync(join(tmpdir(), 'chat-search-reports-'));
    writeFileSync(
      join(reportsDir, 'national-1-150726-1200.json'),
      JSON.stringify({
        assessment: {
          components: [{ component_id: 'leadership', narrative_operator: 'Mayors held briefings.' }],
        },
      }),
    );
    try {
      let redactedWith = null;
      await handleChatToolCall('search_reports', { query: 'briefings', limit: 1 }, {
        ...gates,
        reportData: { display_view: 'operator' },
        reportsDir,
        redactReportPayload: (raw, view) => {
          redactedWith = view;
          return { assessment: { components: [] } };
        },
      });
      assert.equal(redactedWith, 'operator');
    } finally {
      rmSync(reportsDir, { recursive: true, force: true });
    }
  });

  it('get_signal rejects unknown ids with guidance', async () => {
    const result = await handleChatToolCall('get_signal', { signal_id: 'bogus' }, { ...gates, reportData: {} });
    assert.match(result, /Invalid signal_id format/);
    assert.match(result, /Use lookup_signals to find valid signal ids/);
  });

  it('get_report defaults to the loaded report scope', async () => {
    const result = await handleChatToolCall('get_report', { date: '1999-01-01' }, {
      ...gates,
      reportData: { assessment: { report_scope: { id: 'north' } } },
    });
    assert.match(result, /No report found for 1999-01-01 \(scope=north\)/);
  });
});

describe('propose_signal_flag', () => {
  const gates = { richTools: false, analystToolsEnabled: true, confirmActionsEnabled: true };

  it('proposes a pending action for operators (non-analyst)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chat-pending-flag-'));
    const store = createChatPendingActionStore(join(dir, 'test.sqlite'));
    const proposed = [];
    const result = await handleChatToolCall(
      'propose_signal_flag',
      { signal_id: 'signals-news-2026-07-12.json#3', reason: 'wrong_type', note: 'looks off' },
      { ...gates, pendingActionStore: store, ownerUid: 'u1', sessionId: 's1', onActionProposed: (p) => proposed.push(p) },
    );
    assert.match(result, /Action proposed/);
    assert.match(result, /Do not claim the action was executed/);
    assert.equal(proposed.length, 1);
    assert.match(proposed[0].summary, /Flag signal signals-news-2026-07-12\.json#3: wrong_type/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects an invalid reason and missing references', async () => {
    const ctx = { ...gates, pendingActionStore: { createPending: () => ({ id: 'x' }) }, ownerUid: 'u1', sessionId: 's1' };
    const bad = await handleChatToolCall('propose_signal_flag', { signal_id: 'a.json#1', reason: 'meh' }, ctx);
    assert.match(bad, /Invalid reason/);
    const noRef = await handleChatToolCall('propose_signal_flag', { reason: 'other' }, ctx);
    assert.match(noRef, /Provide signal_id .* or source_ref/);
  });

  it('executePendingAction appends to the flag store for a non-analyst operator', async () => {
    const appended = [];
    const result = await executePendingAction(
      {
        toolName: 'propose_signal_flag',
        params: { source_ref: 'https://example.com/a', reason: 'not_a_signal', note: 'ad, not behavior' },
        sessionId: 's9',
      },
      {
        userEmail: 'operator@test.com',
        sessionId: 's9',
        signalFlagStore: {
          append(record) {
            appended.push(record);
            return { ...record, flag_id: 'sf_test_1', flagged_at: '2026-07-30T00:00:00.000Z' };
          },
        },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.flag_id, 'sf_test_1');
    assert.equal(appended.length, 1);
    assert.equal(appended[0].reason, 'not_a_signal');
    assert.equal(appended[0].user, 'operator@test.com');
    assert.equal(appended[0].session_id, 's9');
  });

  it('executePendingAction rejects an invalid stored reason', async () => {
    await assert.rejects(
      executePendingAction(
        { toolName: 'propose_signal_flag', params: { source_ref: 'x', reason: 'nope' } },
        { userEmail: 'operator@test.com', signalFlagStore: { append: () => ({}) } },
      ),
      /Invalid flag reason/,
    );
  });
});
