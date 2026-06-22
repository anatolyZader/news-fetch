import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentBudgetGovernor } from '../../../cross-cut-modules/agent/agentBudgetGovernor.js';
import { validateSubmitToolPayload } from '../../../cross-cut-modules/agent/schemaValidator.js';
import { createAgentKernel } from '../../../cross-cut-modules/agent/agentKernel.js';

describe('agentBudgetGovernor', () => {
  it('enters degrade mode at 80% spend', () => {
    const gov = createAgentBudgetGovernor({ maxUsd: 1 });
    gov.recordUsage({
      model: 'claude-haiku-4-5-20251001',
      usage: { input_tokens: 800_000, output_tokens: 50_000 },
    });
    assert.equal(gov.degradeMode, 'focus_top_3_components');
  });
});

describe('schemaValidator', () => {
  it('requires evidence_refs on submit_component_assessment', () => {
    const r = validateSubmitToolPayload('submit_component_assessment', {
      component_id: 'leadership',
      severity: 'moderate',
      claims: [{ text: 'test' }],
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('evidence_refs')));
  });
});

describe('agentKernel', () => {
  it('records submit payloads from tool loop', async () => {
    const llmPort = {
      runToolLoop: async (opts) => {
        await opts.executeTool('submit_plan', {
          focus_components: ['leadership'],
          investigation_tasks: [],
          abstention_components: [],
        });
        return { messages: [], lastAssistantText: 'ok', stopReason: 'end_turn', usage: null };
      },
    };
    const kernel = createAgentKernel({ llmPort });
    const result = await kernel.run({
      profile: 'assessment_planner',
      model: 'claude-haiku-4-5-20251001',
      system: 'test',
      messages: [],
      executeTool: async () => '{}',
    });
    assert.equal(result.submitPayloads.length, 1);
    assert.equal(result.submitPayloads[0].tool, 'submit_plan');
  });

  it('passes valid tool args through to executeTool (input_schema)', async () => {
    let executeCalls = 0;
    const captured = { result: null };
    const llmPort = {
      runToolLoop: async (opts) => {
        captured.result = await opts.executeTool('my_tool', { x: 1 });
        return { messages: [], lastAssistantText: 'ok', stopReason: 'end_turn', usage: null };
      },
    };

    const kernel = createAgentKernel({ llmPort });
    await kernel.run({
      profile: 'assessment_planner',
      model: 'claude-haiku-4-5-20251001',
      system: 'test',
      messages: [],
      tools: [
        {
          name: 'my_tool',
          input_schema: {
            type: 'object',
            required: ['x'],
            properties: { x: { type: 'number' } },
          },
        },
      ],
      executeTool: async () => {
        executeCalls += 1;
        return 'tool_ok';
      },
    });

    assert.equal(executeCalls, 1);
    assert.equal(captured.result, 'tool_ok');
  });

  it('rejects invalid tool args before executeTool (input_schema)', async () => {
    let executeCalls = 0;
    const captured = { result: null };
    const llmPort = {
      runToolLoop: async (opts) => {
        captured.result = await opts.executeTool('my_tool', { x: 'bad' });
        return { messages: [], lastAssistantText: 'ok', stopReason: 'end_turn', usage: null };
      },
    };

    const kernel = createAgentKernel({ llmPort });
    await kernel.run({
      profile: 'assessment_planner',
      model: 'claude-haiku-4-5-20251001',
      system: 'test',
      messages: [],
      tools: [
        {
          name: 'my_tool',
          input_schema: {
            type: 'object',
            required: ['x'],
            properties: { x: { type: 'number' } },
          },
        },
      ],
      executeTool: async () => {
        executeCalls += 1;
        return 'tool_ok';
      },
    });

    assert.equal(executeCalls, 0);
    const parsed = JSON.parse(captured.result);
    assert.equal(parsed.error, 'validation_failed');
    assert.ok(parsed.errors.length > 0);
  });

  it('skips input_schema validation when tool has no input_schema', async () => {
    let executeCalls = 0;
    const captured = { result: null };
    const llmPort = {
      runToolLoop: async (opts) => {
        captured.result = await opts.executeTool('my_tool_no_schema', 'not_an_object');
        return { messages: [], lastAssistantText: 'ok', stopReason: 'end_turn', usage: null };
      },
    };

    const kernel = createAgentKernel({ llmPort });
    await kernel.run({
      profile: 'assessment_planner',
      model: 'claude-haiku-4-5-20251001',
      system: 'test',
      messages: [],
      tools: [{ name: 'my_tool_no_schema' }],
      executeTool: async () => {
        executeCalls += 1;
        return 'tool_ok';
      },
    });

    assert.equal(executeCalls, 1);
    assert.equal(captured.result, 'tool_ok');
  });

  it('chat profile uses chat compact flag by default', async () => {
    const prevChat = process.env.CHAT_COMPACT_TOOL_LOOP;
    const prevAssess = process.env.RESILIENCE_ASSESS_COMPACT_TOOL_LOOP;
    process.env.CHAT_COMPACT_TOOL_LOOP = '0';
    process.env.RESILIENCE_ASSESS_COMPACT_TOOL_LOOP = '1';
    let captured = null;
    const llmPort = {
      runToolLoop: async (opts) => {
        captured = opts;
        return { messages: [], lastAssistantText: 'ok', stopReason: 'end_turn', usage: null };
      },
    };
    const kernel = createAgentKernel({ llmPort });
    await kernel.run({
      profile: 'chat',
      model: 'claude-haiku-4-5-20251001',
      system: 'test',
      messages: [],
      executeTool: async () => '{}',
    });
    assert.equal(captured.compactHistoryAfterRound, false);

    process.env.CHAT_COMPACT_TOOL_LOOP = '1';
    await kernel.run({
      profile: 'chat',
      model: 'claude-haiku-4-5-20251001',
      system: 'test',
      messages: [],
      executeTool: async () => '{}',
    });
    assert.equal(captured.compactHistoryAfterRound, true);

    await kernel.run({
      profile: 'assessment_planner',
      model: 'claude-haiku-4-5-20251001',
      system: 'test',
      messages: [],
      executeTool: async () => '{}',
    });
    assert.equal(captured.compactHistoryAfterRound, true);

    if (prevChat === undefined) delete process.env.CHAT_COMPACT_TOOL_LOOP;
    else process.env.CHAT_COMPACT_TOOL_LOOP = prevChat;
    if (prevAssess === undefined) delete process.env.RESILIENCE_ASSESS_COMPACT_TOOL_LOOP;
    else process.env.RESILIENCE_ASSESS_COMPACT_TOOL_LOOP = prevAssess;
  });
});
