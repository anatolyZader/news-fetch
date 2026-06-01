import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDecisionBriefOutput,
  assertOperatorSafeBrief,
  generateDecisionBrief,
  decisionBriefEnabled,
} from '../../../../business_modules/resilience/infrastructure/decisionBriefGenerator.js';

describe('decisionBriefGenerator', () => {
  it('normalizeDecisionBriefOutput accepts valid shape', () => {
    const out = normalizeDecisionBriefOutput({
      summary: 'Focus on information gaps.',
      priority_items: [{
        attention_id: 'pattern:x',
        recommendation_id: 'rec:x',
        level: 'warning',
        rationale: 'Rumor cluster',
        suggested_next_step: 'Review comms',
      }],
    });
    assert.equal(out.summary, 'Focus on information gaps.');
    assert.equal(out.priority_items.length, 1);
  });

  it('assertOperatorSafeBrief rejects score notation', () => {
    assert.throws(
      () => assertOperatorSafeBrief({ summary: 'Component at 7/10 is weak', priority_items: [] }),
      /forbidden score/,
    );
  });

  it('generateDecisionBrief returns null when disabled', async () => {
    const prev = process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
    process.env.RESILIENCE_DECISION_BRIEF_ENABLED = '0';
    try {
      const brief = await generateDecisionBrief({ date: '2026-05-01', components: [] });
      assert.equal(brief, null);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
      else process.env.RESILIENCE_DECISION_BRIEF_ENABLED = prev;
    }
  });

  it('generateDecisionBrief parses mock client response', async () => {
    const prevFlag = process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.RESILIENCE_DECISION_BRIEF_ENABLED = '1';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    try {
      const client = {
        messages: {
          create: async () => ({
            content: [{
              type: 'text',
              text: JSON.stringify({
                summary: 'Sampling is degraded; prioritize field corroboration.',
                priority_items: [{
                  attention_id: 'epistemic:field_anchor_only',
                  recommendation_id: null,
                  level: 'warning',
                  rationale: 'Digital darkness active.',
                  suggested_next_step: 'Confirm field reports.',
                }],
              }),
            }],
            usage: { input_tokens: 10, output_tokens: 20 },
          }),
        },
      };
      const brief = await generateDecisionBrief({
        date: '2026-05-01',
        components: [{ component_id: 'narrative', confidence: 'low' }],
        assessment_mode: 'field_anchor_only',
      }, { reportScopeId: 'north', client });
      assert.equal(brief.source, 'agent_batch');
      assert.match(brief.summary, /field corroboration/i);
      assert.equal(brief.priority_items.length, 1);
    } finally {
      if (prevFlag === undefined) delete process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
      else process.env.RESILIENCE_DECISION_BRIEF_ENABLED = prevFlag;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it('decisionBriefEnabled defaults on', () => {
    const prev = process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
    delete process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
    try {
      assert.equal(decisionBriefEnabled(), true);
    } finally {
      if (prev !== undefined) process.env.RESILIENCE_DECISION_BRIEF_ENABLED = prev;
    }
  });
});
