import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildChatToolList,
  TOOL_PROFILES,
} from '../../../../business_modules/chat/domain/tools/chatToolSchemas.js';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(join(fixtureDir, '../../../fixtures/chat-agent-golden.json'), 'utf8'),
);

describe('chatAgentToolSelection (offline eval)', () => {
  it('sources profile only exposes source tools', () => {
    const tools = buildChatToolList({
      analystToolsEnabled: true,
      isAnalyst: true,
      confirmActionsEnabled: true,
      toolProfile: 'sources',
    });
    const names = new Set(tools.map((t) => t.name));
    for (const expected of TOOL_PROFILES.sources) {
      assert.ok(names.has(expected), `missing ${expected}`);
    }
    assert.equal(names.has('lookup_pbo'), false);
  });

  it('golden fixture documents expected tools per profile', () => {
    assert.ok(Array.isArray(golden.cases));
    assert.ok(golden.cases.length >= 5);
    for (const c of golden.cases) {
      const tools = buildChatToolList({
        analystToolsEnabled: true,
        isAnalyst: true,
        confirmActionsEnabled: true,
        toolProfile: c.toolProfile ?? 'default',
      });
      const names = new Set(tools.map((t) => t.name));
      const hit = c.expectedTools.some((name) => names.has(name));
      assert.ok(hit, `${c.id}: none of ${c.expectedTools.join(', ')} in profile ${c.toolProfile}`);
    }
  });

  it('default profile excludes guidance tools when operator epistemic overlay is off', () => {
    const prev = process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY;
    process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY = '0';
    try {
      const tools = buildChatToolList({
        analystToolsEnabled: true,
        isAnalyst: false,
        confirmActionsEnabled: true,
        toolProfile: 'default',
      });
      const names = new Set(tools.map((t) => t.name));
      assert.equal(names.has('list_attention_items'), false);
      assert.equal(names.has('get_decision_brief'), false);
      assert.equal(names.has('list_operator_recommendations'), false);
      assert.equal(names.has('propose_operator_recommendation'), false);
      assert.ok(names.has('lookup_signals'));
      assert.ok(names.has('trace_component_timeline'));
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY;
      else process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY = prev;
    }
  });

  it('default profile keeps guidance tools for analyst users when operator epistemic overlay is off', () => {
    const prev = process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY;
    process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY = '0';
    try {
      const tools = buildChatToolList({
        analystToolsEnabled: true,
        isAnalyst: true,
        confirmActionsEnabled: true,
        toolProfile: 'default',
      });
      const names = new Set(tools.map((t) => t.name));
      assert.ok(names.has('list_attention_items'));
      assert.ok(names.has('get_decision_brief'));
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY;
      else process.env.RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY = prev;
    }
  });

});
