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
});
