import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  planDeterministicToolCalls,
  formatDeterministicFallbackResponse,
} from '../../../../business_modules/chat/app/chatDeterministicFallback.js';

describe('chatDeterministicFallback', () => {
  it('hub tier plans attention and decision brief tools', () => {
    const calls = planDeterministicToolCalls('hub', 'what should I focus on', {});
    assert.deepEqual(calls.map((c) => c.tool), ['list_attention_items', 'get_decision_brief']);
  });

  it('compare tier plans compare_dates with report dates', () => {
    const calls = planDeterministicToolCalls('compare', 'what changed', {
      assessment: { date: '2026-06-01' },
      report_dates: ['2026-05-30', '2026-06-01'],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, 'compare_dates');
    assert.equal(calls[0].input.date_a, '2026-05-30');
    assert.equal(calls[0].input.date_b, '2026-06-01');
  });

  it('minimal tier plans lookup_signals by default', () => {
    const calls = planDeterministicToolCalls('minimal', 'show signals about shelter', {});
    assert.equal(calls[0].tool, 'lookup_signals');
  });

  it('formatDeterministicFallbackResponse includes deterministic header', () => {
    const text = formatDeterministicFallbackResponse('tool output', { tier: 'hub', reason: 'test' });
    assert.match(text, /Deterministic mode/);
    assert.match(text, /tool output/);
    assert.match(text, /hub/);
  });
});
