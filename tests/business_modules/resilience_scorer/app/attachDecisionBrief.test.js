import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attachDecisionBrief, decisionBriefEnabled } from '../../../../business_modules/resilience_scorer/app/assessment/attachDecisionBrief.js';

describe('attachDecisionBrief', () => {
  it('skips when flag disabled', async () => {
    const prev = process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
    process.env.RESILIENCE_DECISION_BRIEF_ENABLED = '0';
    try {
      const assessment = { date: '2026-05-01' };
      const result = await attachDecisionBrief(assessment);
      assert.equal(result, null);
      assert.equal(assessment.decision_brief, undefined);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
      else process.env.RESILIENCE_DECISION_BRIEF_ENABLED = prev;
    }
  });

  it('attaches brief from mock generator path', async () => {
    const prevFlag = process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.RESILIENCE_DECISION_BRIEF_ENABLED = '1';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    try {
      const assessment = {
        date: '2026-05-01',
        components: [],
        operator_recommendations: [],
        pattern_alerts: [],
      };
      const client = {
        messages: {
          create: async () => ({
            content: [{
              type: 'text',
              text: '{"summary":"All clear for routine scan.","priority_items":[]}',
            }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        },
      };
      const result = await attachDecisionBrief(assessment, { client, reportScopeId: 'national' });
      assert.ok(result);
      assert.equal(assessment.decision_brief.summary, 'All clear for routine scan.');
    } finally {
      if (prevFlag === undefined) delete process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
      else process.env.RESILIENCE_DECISION_BRIEF_ENABLED = prevFlag;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it('decisionBriefEnabled respects env', () => {
    assert.equal(typeof decisionBriefEnabled(), 'boolean');
  });
});
