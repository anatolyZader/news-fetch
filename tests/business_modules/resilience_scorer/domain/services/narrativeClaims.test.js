import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeAgentClaimsWithFacts,
  mergeClaimsLists,
  agentClaimsForComponent,
  buildDigestStubClaims,
  supplementFactsWithDigestStubs,
} from '../../../../../business_modules/resilience_scorer/domain/services/narrative/narrativeClaims.js';
import { buildSignalRefRegistry } from '../../../../../business_modules/resilience_scorer/domain/services/narrative/signalRefRegistry.js';

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
    const scored = {
      narrative: { signals: [fearSignal] },
      lifesaving_behavior: { signals: [complianceSignal] },
    };
    const registry = buildSignalRefRegistry(scored);
    const stubs = buildDigestStubClaims(registry);

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

function claim(text) {
  return { text, signal_refs: ['pbo_note@idx:1'] };
}

describe('narrativeClaims — PBO score-line hygiene', () => {
  it('drops a claim that is nothing but an officer score line', () => {
    const out = agentClaimsForComponent({
      narrative_claims: [claim('[אעבלין] הון ומשאבי קהילה: avg=75% (75%, 75%, 75%) — אין')],
    });
    assert.deepEqual(out, []);
  });

  it('keeps the substance and the municipality when a score line carries content', () => {
    const [kept] = agentClaimsForComponent({
      narrative_claims: [claim('[בועינה] דאגה לרווחה: avg=92% (100%, 75%) — מחלקת הרווחה פועלת ברציפות')],
    });
    assert.ok(kept.text.startsWith('[בועינה]'));
    assert.ok(kept.text.includes('מחלקת הרווחה פועלת ברציפות'));
    assert.ok(!kept.text.includes('avg='));
  });

  it('leaves ordinary claim text byte-for-byte unchanged', () => {
    const text = 'Shelter compliance improved in Nahariya  after the alert.';
    const [kept] = agentClaimsForComponent({ narrative_claims: [claim(text)] });
    assert.equal(kept.text, text);
  });
});
