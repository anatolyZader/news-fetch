import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComponentEvidence,
  deriveSufficiency,
  deriveBalance,
  derivePboReviewCompleteness,
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

  it('stamps construct_role on signals and groups primary evidence in construct_role_mix', () => {
    const { by_component } = buildComponentEvidence([shelterSignal(0)]);
    const lifesaving = by_component.lifesaving_behavior;
    assert.equal(lifesaving.signals[0].construct_role, 'response');
    assert.deepEqual(lifesaving.evidence_basis.construct_role_mix, { response: 1 });
    // Inferred spillover does not enter the mix.
    assert.deepEqual(by_component.leadership.evidence_basis.construct_role_mix, {});
  });

  it('non-scoring fallback (novel_behavior_observed) never moves bands', () => {
    const oovOnly = [0, 1, 2].map((i) => ({
      signal_type: 'novel_behavior_observed',
      source_type: 'news',
      article_url: `https://example.com/oov-${i}`,
      evidence: `Unfamiliar behavior pattern (${i}).`,
    }));
    const { by_component } = buildComponentEvidence(oovOnly);
    const wellbeing = by_component.wellbeing_at_risk.evidence_basis;
    assert.equal(wellbeing.signal_count, 0);
    assert.equal(wellbeing.sufficiency, 'none');
    assert.equal(wellbeing.balance, null);
    assert.equal(wellbeing.inferred_context.count, 3);
    assert.equal(by_component.wellbeing_at_risk.signals[0].routing_role, 'inferred');
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

  it('cross_component_overlap reports primary-shared articles; inferred edges create no sharing', () => {
    // compliance_enter_shelter: lifesaving primary + leadership/belonging inferred.
    // Same article also yields a wellbeing-primary distress signal → shared 2 ways.
    const sharedArticle = 'https://example.com/one-event';
    const signals = [
      { signal_type: 'compliance_enter_shelter', source_type: 'news', article_url: sharedArticle, evidence: 'shelter' },
      { signal_type: 'psychological_distress', source_type: 'news', article_url: sharedArticle, evidence: 'distress' },
      { signal_type: 'psychological_distress', source_type: 'radio', article_url: 'https://example.com/solo', evidence: 'distress2' },
    ];
    const { by_component, cross_component_overlap } = buildComponentEvidence(signals);

    assert.equal(cross_component_overlap.shared_article_total, 1);
    assert.deepEqual(cross_component_overlap.shared_articles, [{
      article_key: sharedArticle,
      components: ['lifesaving_behavior', 'wellbeing_at_risk'],
      signal_count: 2,
    }]);
    assert.deepEqual(cross_component_overlap.components_involved, ['lifesaving_behavior', 'wellbeing_at_risk']);

    // Inferred spillover (leadership) never counts as sharing.
    assert.ok(!cross_component_overlap.components_involved.includes('leadership'));

    // Per-component annotation: wellbeing has 2 articles, 1 shared.
    assert.deepEqual(by_component.wellbeing_at_risk.evidence_basis.shared_primary_articles, { count: 1, share: 0.5 });
    assert.deepEqual(by_component.lifesaving_behavior.evidence_basis.shared_primary_articles, { count: 1, share: 1 });
    // Zero-article component: null share.
    assert.deepEqual(by_component.narrative.evidence_basis.shared_primary_articles, { count: 0, share: null });
  });

  it('shared_articles list is capped but totals and annotation stay uncapped', () => {
    // 15 articles, each contributing to both lifesaving (shelter) and wellbeing (distress).
    const signals = [];
    for (let i = 0; i < 15; i++) {
      const url = `https://example.com/a${String(i).padStart(2, '0')}`;
      signals.push(
        { signal_type: 'compliance_enter_shelter', source_type: 'news', article_url: url, evidence: `s${i}` },
        { signal_type: 'psychological_distress', source_type: 'news', article_url: url, evidence: `d${i}` },
      );
    }
    const { by_component, cross_component_overlap } = buildComponentEvidence(signals);
    assert.equal(cross_component_overlap.shared_articles.length, 12);
    assert.equal(cross_component_overlap.shared_article_total, 15);
    assert.deepEqual(by_component.wellbeing_at_risk.evidence_basis.shared_primary_articles, { count: 15, share: 1 });
  });

  it('mirror_context surfaces mirror twins anchored on another component', () => {
    // wellbeing_support_gap routes to wellbeing_at_risk (-, primary); its mirror
    // wellbeing_support_accessed has NO wellbeing edge (v10 construct-role rule)
    // and anchors on community_capital. The wellbeing balance must disclose that.
    const signals = [
      { signal_type: 'wellbeing_support_gap', source_type: 'visits', article_index: 1, evidence: 'Elderly cannot reach support.' },
      { signal_type: 'wellbeing_support_accessed', source_type: 'pbo', article_index: 2, evidence: 'Welfare dept in daily contact.' },
      { signal_type: 'wellbeing_support_accessed', source_type: 'pbo', article_index: 3, evidence: 'Support hotline active.' },
    ];
    const { by_component } = buildComponentEvidence(signals);

    const wellbeing = by_component.wellbeing_at_risk.evidence_basis;
    assert.equal(wellbeing.balance, 'one_sided_neg');
    assert.ok(wellbeing.mirror_context, 'wellbeing must carry mirror_context');
    assert.equal(wellbeing.mirror_context.total, 2);
    assert.deepEqual(wellbeing.mirror_context.types[0], {
      signal_type: 'wellbeing_support_accessed',
      count: 2,
      anchor_components: ['community_capital'],
    });

    // community_capital sees the accessed signals directly and its gap mirror
    // DOES route there (inferred), so no asymmetric mirror note for it.
    assert.equal(by_component.community_capital.evidence_basis.mirror_context, null);
  });

  it('deriveSufficiency / deriveBalance still behave on raw counts', () => {
    assert.equal(deriveSufficiency({ signal_count: 0, distinct_articles: 0, source_type_count: 0 }), 'none');
    assert.equal(deriveSufficiency({ signal_count: 7, distinct_articles: 4, source_type_count: 3 }), 'adequate');
    assert.equal(deriveBalance(3, 2), 'contested');
    assert.equal(deriveBalance(5, 0), 'one_sided_pos');
  });
});

const pboReviewItem = (pbo_review_state) => ({
  signal: pbo_review_state == null ? {} : { pbo_review_state },
});

describe('derivePboReviewCompleteness', () => {
  it('returns null when no primary item carries a review state', () => {
    assert.equal(derivePboReviewCompleteness([pboReviewItem(null), pboReviewItem(null)]), null);
  });

  it('shares incomplete against total primary mass, not the PBO subset', () => {
    // 2 incomplete PBO signals inside 40 primary is a 5% problem, not a 100% one.
    const items = [
      ...Array.from({ length: 2 }, () => pboReviewItem('reviewed_incomplete')),
      ...Array.from({ length: 38 }, () => pboReviewItem(null)),
    ];
    const out = derivePboReviewCompleteness(items);
    assert.equal(out.pbo_primary_count, 2);
    assert.equal(out.reviewed_incomplete, 2);
    assert.equal(out.incomplete_share, 0.05);
  });

  it('counts the three states separately', () => {
    const out = derivePboReviewCompleteness([
      pboReviewItem('reviewed_sufficient'),
      pboReviewItem('reviewed_incomplete'),
      pboReviewItem('unreviewed'),
      pboReviewItem('unreviewed'),
    ]);
    assert.equal(out.reviewed_sufficient, 1);
    assert.equal(out.reviewed_incomplete, 1);
    assert.equal(out.unreviewed, 2);
    assert.equal(out.incomplete_share, 0.25);
  });

  it('ignores the legacy pbo_completeness key', () => {
    // The pre-2026-06-20 extractor wrote 'incomplete' there for municipalities
    // nobody had reviewed — reading it would resurrect the two-state collapse.
    const out = derivePboReviewCompleteness([
      { signal: { pbo_completeness: 'incomplete', pbo_evidence_thin: true } },
      { signal: { pbo_review_state: 'unreviewed' } },
    ]);
    assert.equal(out.pbo_primary_count, 1);
    assert.equal(out.reviewed_incomplete, 0);
    // null, not 0 — nothing here was reviewed, so there is no share to report.
    assert.equal(out.incomplete_share, null);
  });

  it('treats an unrecognised state as unreviewed', () => {
    const out = derivePboReviewCompleteness([pboReviewItem('something_else')]);
    assert.equal(out.unreviewed, 1);
    assert.equal(out.reviewed_incomplete, 0);
  });
});

// non_compliance_ignore_guidelines routes: lifesaving_behavior primary '-',
// leadership inferred '-'.
function nonComplianceSignal() {
  return {
    signal_type: 'non_compliance_ignore_guidelines',
    source_type: 'pbo',
    article_source: 'pbo-צפת',
    article_url: 'https://example.com/safed',
    grounding_tier: 'grounded',
    evidence: 'רכבים המשיכו בנסיעתם במהלך האזעקה',
  };
}

describe('presence gate — routing role and visibility', () => {
  it('does not trip the gate on a component reached only by an inferred edge', () => {
    const { by_component } = buildComponentEvidence([nonComplianceSignal()]);
    assert.equal(by_component.leadership.critical_flags.presence_gate, null);
    assert.equal(by_component.leadership.critical_flags.salient_single_signal, null);
  });

  it('still trips the gate on the primary-edge component', () => {
    const { by_component } = buildComponentEvidence([nonComplianceSignal()]);
    const gate = by_component.lifesaving_behavior.critical_flags.presence_gate;
    assert.ok(gate, 'lifesaving_behavior should still gate');
    assert.equal(gate.signal_type, 'non_compliance_ignore_guidelines');
  });

  it('stamps presence_gate_trigger on the slim row that tripped it', () => {
    const { by_component } = buildComponentEvidence([nonComplianceSignal()]);
    const rows = by_component.lifesaving_behavior.signals;
    const trigger = rows.filter((r) => r.presence_gate_trigger);
    assert.equal(trigger.length, 1);
    assert.equal(trigger[0].signal_type, 'non_compliance_ignore_guidelines');
    assert.equal(by_component.leadership.signals.some((r) => r.presence_gate_trigger), false);
  });
});

function pboLeadershipSignal(i, muni) {
  return {
    signal_type: 'leadership_visible_presence',
    source_type: 'pbo',
    article_source: `pbo-${muni}`,
    article_url: `https://example.com/pbo-${muni}-${i}`,
    evidence: `Local leadership is visible (${i}).`,
  };
}

describe('deriveConcentrationWarning — single-key regression', () => {
  it('warns when a single outlet holds 100% of the evidence', () => {
    const signals = [0, 1, 2, 3].map((i) => pboLeadershipSignal(i, 'safed'));
    const { by_component } = buildComponentEvidence(signals);
    const cw = by_component.leadership.evidence_basis.concentration_warning;
    assert.ok(cw, 'a 100%-single-outlet component must warn, not go silent');
    assert.equal(cw.share, 1);
  });

  it('does not warn on an all-unattributed pool', () => {
    const signals = [0, 1, 2, 3].map((i) => ({
      signal_type: 'leadership_visible_presence',
      evidence: `Unattributed note ${i}.`,
    }));
    const { by_component } = buildComponentEvidence(signals);
    assert.equal(by_component.leadership.evidence_basis.concentration_warning, null);
  });
});

function leadershipSignalFrom(sourceType, i) {
  return {
    signal_type: 'leadership_visible_presence',
    source_type: sourceType,
    article_source: `${sourceType}-${i}`,
    article_url: `https://example.com/${sourceType}-${i}`,
    evidence: `Leadership is visible (${sourceType} ${i}).`,
  };
}

describe('source_class_exposure', () => {
  it('marks leadership as self-assessed when PBO reports dominate', () => {
    const signals = [...Array.from({ length: 9 }, (_, i) => leadershipSignalFrom('pbo', i)), leadershipSignalFrom('news', 0)];
    const sce = buildComponentEvidence(signals).by_component.leadership.evidence_basis.source_class_exposure;
    assert.equal(sce.self_assessed, true);
    assert.equal(sce.self_reported_share, 0.9);
    assert.equal(sce.independent_share, 0.1);
  });

  it('catches a component with no independent corroboration that no outlet threshold sees', () => {
    // 40 distinct municipalities plus field visits: no single outlet is close
    // to the 0.6 outlet threshold, yet independent corroboration is ~nil.
    const signals = [
      ...Array.from({ length: 40 }, (_, i) => leadershipSignalFrom('pbo', i)),
      ...Array.from({ length: 20 }, (_, i) => leadershipSignalFrom('visits', i)),
      leadershipSignalFrom('news', 0),
    ];
    const basis = buildComponentEvidence(signals).by_component.leadership.evidence_basis;
    assert.equal(basis.concentration_warning, null, 'per-outlet threshold stays silent here');
    assert.ok(basis.source_class_exposure.independent_share <= 0.02);
  });

  it('does not mark a component self-assessed when the PBO describes a third party', () => {
    const signals = Array.from({ length: 5 }, (_, i) => ({
      signal_type: 'vulnerable_population_mapping',
      source_type: 'pbo',
      article_source: `pbo-${i}`,
      article_url: `https://example.com/pbo-${i}`,
      evidence: `At-risk residents are mapped (${i}).`,
    }));
    const sce = buildComponentEvidence(signals).by_component.wellbeing_at_risk.evidence_basis.source_class_exposure;
    assert.equal(sce.self_assessed, false);
    assert.equal(sce.self_reported_share, 0);
  });
});

function reviewStateItem(state) {
  return { signal: { pbo_review_state: state, source_type: 'pbo' } };
}

describe('derivePboReviewCompleteness — nothing reviewed is not clean', () => {
  it('reports a null incomplete_share when no municipality was reviewed', () => {
    const rc = derivePboReviewCompleteness([reviewStateItem('unreviewed'), reviewStateItem('unreviewed')]);
    assert.equal(rc.unreviewed, 2);
    assert.equal(rc.reviewed_count, 0);
    assert.equal(rc.review_coverage_share, 0);
    assert.equal(rc.incomplete_share, null, 'zero would read as "reviewed and clean"');
  });

  it('reports a numeric share once anything has been reviewed', () => {
    const rc = derivePboReviewCompleteness([
      reviewStateItem('reviewed_incomplete'),
      reviewStateItem('reviewed_sufficient'),
      reviewStateItem('unreviewed'),
      reviewStateItem('unreviewed'),
    ]);
    assert.equal(rc.reviewed_count, 2);
    assert.equal(rc.review_coverage_share, 0.5);
    assert.equal(rc.incomplete_share, 0.25);
  });

  it('still returns null when no signal carries a review state at all', () => {
    assert.equal(derivePboReviewCompleteness([{ signal: { source_type: 'news' } }]), null);
  });
});
