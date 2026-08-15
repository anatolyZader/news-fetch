import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluatePresenceGates,
  findPresenceGateMatch,
  PRESENCE_GATE_ALL_RULES,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/presenceGates.js';
import {
  SIGNAL_TO_COMPONENTS,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/routing/signalRouting.js';
import {
  GROUNDING_TIER,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

const COMPONENT = 'wellbeing_at_risk';

function harmItem(overrides = {}) {
  return {
    signal: {
      signal_type: 'harm_to_population',
      intensity: 'moderate',
      grounding_tier: GROUNDING_TIER.grounded,
      evidence: 'Residents hospitalized after strike on the neighborhood.',
      ...overrides,
    },
  };
}

describe('presenceGates — harm_wellbeing minIntensity regression', () => {
  it('light-intensity grounded harm_to_population does NOT trigger on wellbeing_at_risk', () => {
    const result = evaluatePresenceGates(COMPONENT, [harmItem({ intensity: 'light' })]);
    assert.equal(result.triggered, false);
    assert.equal(result.rule_id, null);
    assert.equal(result.signal_type, null);
  });

  it('moderate-intensity grounded harm_to_population triggers the harm_wellbeing rule', () => {
    const result = evaluatePresenceGates(COMPONENT, [harmItem({ intensity: 'moderate' })]);
    assert.equal(result.triggered, true);
    assert.equal(result.rule_id, 'harm_wellbeing');
    assert.equal(result.signal_type, 'harm_to_population');
    assert.ok(result.evidence_snippet);
  });

  it('severe-intensity grounded harm_to_population triggers the harm_wellbeing rule', () => {
    const result = evaluatePresenceGates(COMPONENT, [harmItem({ intensity: 'severe' })]);
    assert.equal(result.triggered, true);
    assert.equal(result.rule_id, 'harm_wellbeing');
    assert.equal(result.signal_type, 'harm_to_population');
  });

  it('non-conflict harm (apartment fire) does NOT trigger the harm_wellbeing gate', () => {
    // The 2026-04-01 north report's critical flag was driven by a domestic
    // apartment fire — tragic, but not a war-resilience critical failure.
    const result = evaluatePresenceGates(COMPONENT, [harmItem({
      intensity: 'severe',
      evidence: 'A roughly 70-year-old woman was killed this morning in a fire in an apartment in Ma\'alot-Tarshiha.',
    })]);
    assert.equal(result.triggered, false);
    assert.equal(result.rule_id, null);
  });

  it('Hebrew conflict-linked harm still triggers the harm_wellbeing gate', () => {
    const result = evaluatePresenceGates(COMPONENT, [harmItem({
      evidence: 'תושבת נפצעה מרסיס יירוט שנפל בחצר ביתה בעקבות האזעקה',
    })]);
    assert.equal(result.triggered, true);
    assert.equal(result.rule_id, 'harm_wellbeing');
  });

  it('ungrounded harm_to_population (no grounding_tier) does not trigger regardless of intensity', () => {
    const result = evaluatePresenceGates(COMPONENT, [
      harmItem({ intensity: 'severe', grounding_tier: undefined }),
    ]);
    assert.equal(result.triggered, false);
    assert.equal(result.rule_id, null);
  });
});

describe('presenceGates — routing role', () => {
  it('does not auto-generate a leadership gate off an inferred edge', () => {
    const rule = PRESENCE_GATE_ALL_RULES.find((r) => r.id === 'critical_non_compliance_ignore_guidelines');
    assert.ok(rule, 'auto rule should still exist');
    assert.ok(rule.componentIds.includes('lifesaving_behavior'));
    assert.ok(
      !rule.componentIds.includes('leadership'),
      'leadership is an inferred edge for non_compliance_ignore_guidelines',
    );
  });

  it('every rule component is reachable over a negative primary edge', () => {
    const offenders = [];
    for (const rule of PRESENCE_GATE_ALL_RULES) {
      for (const componentId of rule.componentIds) {
        const reachable = rule.signalTypes.some((t) => {
          const edge = SIGNAL_TO_COMPONENTS[t]?.[componentId];
          return edge?.polarity === '-' && edge.role !== 'inferred';
        });
        if (!reachable) offenders.push(`${rule.id} → ${componentId}`);
      }
    }
    assert.deepEqual(offenders, [], `dead presence-gate entries: ${offenders.join(', ')}`);
  });

  it('findPresenceGateMatch returns the item that tripped the gate', () => {
    const item = harmItem();
    const { match, item: tripped } = findPresenceGateMatch(COMPONENT, [item]);
    assert.equal(match.triggered, true);
    assert.equal(tripped, item);
  });

  it('reports no item when nothing trips', () => {
    const { match, item } = findPresenceGateMatch(COMPONENT, []);
    assert.equal(match.triggered, false);
    assert.equal(item, null);
  });
});
