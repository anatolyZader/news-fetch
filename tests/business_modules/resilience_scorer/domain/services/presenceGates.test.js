import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluatePresenceGates,
  isPresenceGatesEnabled,
  PRESENCE_GATE_RULES,
} from '../../../../../business_modules/resilience_scorer/domain/services/presenceGates.js';
import { GROUNDING_TIER } from '../../../../../business_modules/resilience_scorer/domain/services/groundingPolicy.js';

describe('presenceGates', () => {
  const prev = process.env.RESILIENCE_PRESENCE_GATES;

  afterEach(() => {
    if (prev === undefined) delete process.env.RESILIENCE_PRESENCE_GATES;
    else process.env.RESILIENCE_PRESENCE_GATES = prev;
  });

  it('is enabled by default', () => {
    delete process.env.RESILIENCE_PRESENCE_GATES;
    assert.equal(isPresenceGatesEnabled(), true);
  });

  it('triggers for grounded infrastructure_damage_acute on functional_continuity', () => {
    const items = [{
      contribution: -1,
      signal: {
        signal_type: 'infrastructure_damage_acute',
        grounding_tier: GROUNDING_TIER.grounded,
        evidence: 'Power lines down in Kiryat Shmona',
      },
    }];
    const result = evaluatePresenceGates('functional_continuity', items);
    assert.equal(result.triggered, true);
    assert.equal(result.signal_type, 'infrastructure_damage_acute');
    assert.ok(result.rule_id);
  });

  it('does not trigger without grounded tier', () => {
    const items = [{
      contribution: -1,
      signal: {
        signal_type: 'infrastructure_damage_acute',
        grounding_tier: 'weak',
        evidence: 'Power lines down',
      },
    }];
    const result = evaluatePresenceGates('functional_continuity', items);
    assert.equal(result.triggered, false);
  });

  it('does not trigger on unrelated component', () => {
    const items = [{
      contribution: -1,
      signal: {
        signal_type: 'infrastructure_damage_acute',
        grounding_tier: GROUNDING_TIER.grounded,
        evidence: 'Damage reported',
      },
    }];
    const result = evaluatePresenceGates('narrative', items);
    assert.equal(result.triggered, false);
  });

  it('respects RESILIENCE_PRESENCE_GATES=0', () => {
    process.env.RESILIENCE_PRESENCE_GATES = '0';
    const items = [{
      contribution: -1,
      signal: {
        signal_type: 'infrastructure_damage_acute',
        grounding_tier: GROUNDING_TIER.grounded,
        evidence: 'Damage',
      },
    }];
    assert.equal(evaluatePresenceGates('functional_continuity', items).triggered, false);
  });

  it('exports infra rule in PRESENCE_GATE_RULES', () => {
    assert.ok(PRESENCE_GATE_RULES.some((r) => r.id === 'infra_acute_functional'));
  });
});
