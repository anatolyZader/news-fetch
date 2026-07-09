import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNarrativeScoredComponents,
  mergeAgentClaimsWithFacts,
  mergeClaimsLists,
  agentClaimsForComponent,
  buildDigestStubClaims,
  supplementFactsWithDigestStubs,
} from '../../../../../business_modules/resilience_scorer/domain/services/narrative/buildNarrativeScoredComponents.js';
import { buildSignalRefRegistry } from '../../../../../business_modules/resilience_scorer/domain/services/narrativeGrounding/signalRefRegistry.js';

const fearSignal = {
  signal_type: 'fear_expression',
  article_url: 'https://example.com/fear',
  evidence: 'Residents report difficulty sleeping',
};

const complianceSignal = {
  signal_type: 'compliance_enter_shelter',
  article_url: 'https://example.com/compliance',
  evidence: 'High shelter compliance during alerts',
};

describe('buildNarrativeScoredComponents', () => {
  it('groups narrative scope signals by component weight mapping', () => {
    const scored = buildNarrativeScoredComponents([fearSignal, complianceSignal], {
      narrative: { suppression_delta: 2, score_raw: 9, score: 7 },
    });

    assert.ok(scored.narrative.signals.length >= 1);
    assert.ok(scored.lifesaving_behavior.signals.length >= 1);
    assert.equal(scored.narrative.suppression_delta, 2);
    assert.equal(scored.narrative.signal_count, scored.narrative.signals.length);
  });

  it('returns empty signal pools for unmapped components', () => {
    const scored = buildNarrativeScoredComponents([]);
    assert.equal(scored.narrative.signal_count, 0);
    assert.equal(scored.leadership.signal_count, 0);
  });
});

describe('mergeAgentClaimsWithFacts', () => {
  it('prefers agent claims and fills gaps from facts pass', () => {
    const agentClaim = {
      text: 'Agent claim about sleep',
      signal_refs: ['fear_expression@url:https://example.com/fear'],
      relation: 'parallel',
    };
    const factsClaim = {
      text: 'Facts claim about compliance',
      signal_refs: ['compliance_enter_shelter@url:https://example.com/compliance'],
      relation: 'parallel',
    };

    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative_claims: [agentClaim],
      }],
    };

    const merged = mergeAgentClaimsWithFacts(assessment, {
      narrative: [agentClaim, factsClaim],
      lifesaving_behavior: [factsClaim],
    });

    const narrativeComp = merged.components.find((c) => c.component_id === 'narrative');
    assert.equal(narrativeComp.narrative_claims.length, 2);
    assert.equal(narrativeComp.narrative_claims[0].text, agentClaim.text);
  });

  it('maps agent claims field when narrative_claims absent', () => {
    const comp = {
      component_id: 'narrative',
      claims: [{
        text: 'From claims array',
        evidence_refs: ['fear_expression@url:https://example.com/fear'],
      }],
    };
    const claims = agentClaimsForComponent(comp);
    assert.equal(claims.length, 1);
    assert.deepEqual(claims[0].signal_refs, ['fear_expression@url:https://example.com/fear']);
  });

  it('dedupes identical claims in mergeClaimsLists', () => {
    const claim = {
      text: 'Same',
      signal_refs: ['a@url:https://x.com'],
      relation: 'parallel',
    };
    const merged = mergeClaimsLists([claim], [claim]);
    assert.equal(merged.length, 1);
  });

  it('supplementFactsWithDigestStubs fills empty facts when signals exist', () => {
    const scored = buildNarrativeScoredComponents([fearSignal, complianceSignal]);
    const registry = buildSignalRefRegistry(scored);
    const stubs = buildDigestStubClaims(scored, registry);

    const supplemented = supplementFactsWithDigestStubs(
      { lifesaving_behavior: stubs.lifesaving_behavior ?? [] },
      registry,
      { maxClaimsPerComponent: 3 },
    );

    assert.ok(supplemented.narrative?.length > 0);
    assert.ok(supplemented.lifesaving_behavior?.length > 0);
    assert.ok(supplemented.narrative.length <= 3);
  });
});
