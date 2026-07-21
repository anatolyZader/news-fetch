import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComponentEvidence,
  deriveSufficiency,
  deriveBalance,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/componentEvidence.js';

// compliance_enter_shelter routes: lifesaving_behavior primary '+',
// leadership inferred '+', belonging_solidarity inferred '+'.
function shelterSignal(i) {
  return {
    signal_type: 'compliance_enter_shelter',
    source_type: i % 2 === 0 ? 'news' : 'radio',
    article_url: `https://example.com/shelter-${i}`,
    evidence: `Residents entered shelters promptly (${i}).`,
  };
}

describe('buildComponentEvidence (primary-only bands)', () => {
  it('inferred-edge spillover does not feed sufficiency/balance bands', () => {
    const signals = [0, 1, 2, 3].map(shelterSignal);
    const { by_component } = buildComponentEvidence(signals);

    const lifesaving = by_component.lifesaving_behavior.evidence_basis;
    assert.equal(lifesaving.signal_count, 4);
    assert.equal(lifesaving.positive_count, 4);
    assert.equal(lifesaving.balance, 'one_sided_pos');
    assert.notEqual(lifesaving.sufficiency, 'none');

    // Leadership only sees the shelter signals through an inferred edge:
    // bands must read as no primary evidence, with the spillover in context.
    const leadership = by_component.leadership.evidence_basis;
    assert.equal(leadership.signal_count, 0);
    assert.equal(leadership.sufficiency, 'none');
    assert.equal(leadership.balance, null);
    assert.deepEqual(leadership.inferred_context, {
      count: 4,
      positive_count: 4,
      negative_count: 0,
    });
  });

  it('signals list keeps inferred items labeled with routing_role', () => {
    const { by_component } = buildComponentEvidence([shelterSignal(0)]);
    const leadershipSignals = by_component.leadership.signals;
    assert.equal(leadershipSignals.length, 1);
    assert.equal(leadershipSignals[0].routing_role, 'inferred');
    assert.equal(leadershipSignals[0].polarity, '+');

    const lifesavingSignals = by_component.lifesaving_behavior.signals;
    assert.equal(lifesavingSignals[0].routing_role, 'primary');
  });

  it('primary article/source diversity drives sufficiency', () => {
    // Same article and source repeated: thin despite 3 signals... then diverse.
    const sameArticle = [0, 1, 2].map(() => ({
      signal_type: 'psychological_distress',
      source_type: 'news',
      article_url: 'https://example.com/one',
      evidence: 'distress',
    }));
    const { by_component } = buildComponentEvidence(sameArticle);
    assert.equal(by_component.wellbeing_at_risk.evidence_basis.distinct_articles, 1);
    assert.equal(by_component.wellbeing_at_risk.evidence_basis.sufficiency, 'thin');
  });

  it('deriveSufficiency / deriveBalance still behave on raw counts', () => {
    assert.equal(deriveSufficiency({ signal_count: 0, distinct_articles: 0, source_type_count: 0 }), 'none');
    assert.equal(deriveSufficiency({ signal_count: 7, distinct_articles: 4, source_type_count: 3 }), 'adequate');
    assert.equal(deriveBalance(3, 2), 'contested');
    assert.equal(deriveBalance(5, 0), 'one_sided_pos');
  });
});
