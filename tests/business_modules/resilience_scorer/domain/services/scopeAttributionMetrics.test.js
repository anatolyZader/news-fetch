import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateDefaultNorthGate,
  defaultNorthGateThresholdPct,
  defaultNorthGateBlockEnabled,
} from '../../../../../business_modules/resilience_scorer/domain/services/scopeAttributionMetrics.js';

describe('scopeAttributionMetrics.evaluateDefaultNorthGate', () => {
  it('blocks when default-north share exceeds threshold', () => {
    const scoped = [
      { scopeDecision: { source: 'default_north_district' } },
      { scopeDecision: { source: 'default_north_district' } },
      { scopeDecision: { source: 'signal_district' } },
      { scopeDecision: { source: 'signal_district' } },
    ];
    const gate = evaluateDefaultNorthGate(scoped, {
      RESILIENCE_DEFAULT_NORTH_GATE_PCT: '30',
      RESILIENCE_DEFAULT_NORTH_GATE_BLOCK: '1',
    });
    assert.equal(gate.count, 2);
    assert.equal(gate.pct, 50);
    assert.equal(gate.blocked, true);
  });

  it('warn-only when block disabled', () => {
    const scoped = [
      { scopeDecision: { source: 'default_north_district' } },
      { scopeDecision: { source: 'signal_district' } },
    ];
    const gate = evaluateDefaultNorthGate(scoped, {
      RESILIENCE_DEFAULT_NORTH_GATE_PCT: '30',
      RESILIENCE_DEFAULT_NORTH_GATE_BLOCK: '0',
    });
    assert.equal(gate.blocked, false);
    assert.equal(defaultNorthGateBlockEnabled({ RESILIENCE_DEFAULT_NORTH_GATE_BLOCK: '0' }), false);
  });

  it('default threshold is 30', () => {
    assert.equal(defaultNorthGateThresholdPct({}), 30);
  });
});
