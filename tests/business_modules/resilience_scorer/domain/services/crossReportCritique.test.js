import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAIM_WEAKNESS_KINDS,
  CLAIM_WEAKNESS_TIERS,
  claimTokens,
  tokenSimilarity,
  parseSignalRef,
  indexSignalsByRef,
  critiqueClaim,
  critiqueReport,
  clusterClaims,
  aggregateCritiques,
} from '../../../../../business_modules/resilience_scorer/domain/services/critique/crossReportCritique.js';

function signal(overrides = {}) {
  return {
    signal_type: 'community_mutual_aid',
    article_index: 3,
    article_source: 'ynetnews.com',
    source_type: 'news',
    evidence_basis: 'present_in_text',
    extraction_confidence: 0.9,
    grounding_tier: 'grounded',
    ...overrides,
  };
}

function component(overrides = {}) {
  return {
    component_id: 'community_capital',
    narrative_grounding_score: 0.8,
    interpretive_summary: false,
    evidence_basis: {},
    narrative_claims: [],
    ...overrides,
  };
}

function report({ signals = [], components = [], date = '2026-04-03', degraded = false } = {}) {
  return {
    signals,
    assessment: {
      date,
      report_scope: { id: 'north' },
      narrative_pipeline_degraded: degraded,
      components,
    },
    assessment_window: { days: 1, report_date: date },
    generated_at: `${date}T09:00:00.000Z`,
  };
}

describe('crossReportCritique — text normalization', () => {
  it('drops dates, numbers and stopwords but keeps Hebrew', () => {
    const tokens = claimTokens('On 2026-04-03 the residents of מטולה reported 45% shelter use');
    assert.ok(tokens.includes('מטולה'));
    assert.ok(tokens.includes('shelter'));
    assert.ok(!tokens.includes('the'));
    assert.ok(!tokens.includes('residents'));
    assert.ok(!tokens.some((t) => /\d/.test(t)));
  });

  it('scores identical claims as fully similar and disjoint claims as zero', () => {
    const a = claimTokens('shelter compliance improved sharply');
    assert.equal(tokenSimilarity(a, [...a]), 1);
    assert.equal(tokenSimilarity(a, claimTokens('municipal budget delays')), 0);
  });
});

describe('crossReportCritique — ref resolution', () => {
  it('parses a signal_type@articleKey ref', () => {
    assert.deepEqual(parseSignalRef('community_mutual_aid@idx:3'), {
      signalType: 'community_mutual_aid',
      articleKey: 'idx:3',
    });
  });

  it('treats a ref without an article key as unparseable', () => {
    assert.equal(parseSignalRef('open:obs-3'), null);
  });

  it('indexes signals by the same key the narrative registry writes', () => {
    const byRef = indexSignalsByRef([signal()]);
    assert.equal(byRef.get('community_mutual_aid@idx:3').length, 1);
  });
});

describe('crossReportCritique — claim weaknesses', () => {
  const signalsByRef = indexSignalsByRef([
    signal(),
    signal({ signal_type: 'shelter_use', article_index: 9, article_source: 'kan.org.il' }),
  ]);
  const reportContext = {
    groundingComputed: true,
    signalTypes: new Set(['community_mutual_aid', 'shelter_use']),
    articleKeys: new Set(['idx:3', 'idx:9']),
  };

  it('flags a claim with no refs as unsupported', () => {
    const out = critiqueClaim({
      claim: { text: 'Solidarity held', signal_refs: [] },
      component: component(),
      signalsByRef,
      reportContext,
    });
    assert.ok(out.weakness_kinds.includes(CLAIM_WEAKNESS_KINDS.NO_REFS));
    assert.equal(out.unsupported, true);
  });

  it('separates an unknown signal_type from a known type at a missing article', () => {
    const unknown = critiqueClaim({
      claim: { text: 'Aid networks formed', signal_refs: ['invented_type@idx:3'] },
      component: component(),
      signalsByRef,
      reportContext,
    });
    assert.ok(unknown.weakness_kinds.includes(CLAIM_WEAKNESS_KINDS.UNKNOWN_TYPE_REF));

    const drifted = critiqueClaim({
      claim: { text: 'Aid networks formed', signal_refs: ['shelter_use@idx:44'] },
      component: component(),
      signalsByRef,
      reportContext,
    });
    assert.ok(drifted.weakness_kinds.includes(CLAIM_WEAKNESS_KINDS.UNRESOLVED_REF));
    assert.ok(!drifted.weakness_kinds.includes(CLAIM_WEAKNESS_KINDS.UNKNOWN_TYPE_REF));
  });

  it('marks refs outside the signal namespace as external, not missing', () => {
    const out = critiqueClaim({
      claim: { text: 'Observed queue at clinic', signal_refs: ['open:obs-3'] },
      component: component(),
      signalsByRef,
      reportContext,
    });
    assert.ok(out.weakness_kinds.includes(CLAIM_WEAKNESS_KINDS.EXTERNAL_REF));
    assert.equal(CLAIM_WEAKNESS_TIERS[CLAIM_WEAKNESS_KINDS.EXTERNAL_REF], 'thin');
    assert.equal(out.unsupported, false);
  });

  it('does not call PBO support ungrounded when no signal carries a grounding tier', () => {
    const pboByRef = indexSignalsByRef([
      signal({ signal_type: 'pbo_note', source_type: 'pbo', grounding_tier: undefined }),
    ]);
    const out = critiqueClaim({
      claim: { text: 'Welfare department active', signal_refs: ['pbo_note@idx:3'] },
      component: component(),
      signalsByRef: pboByRef,
      reportContext: { ...reportContext, signalTypes: new Set(['pbo_note']) },
    });
    assert.ok(!out.weakness_kinds.includes(CLAIM_WEAKNESS_KINDS.UNGROUNDED_SUPPORT));
  });

  it('keeps component-level findings out of the claim verdict', () => {
    const out = critiqueClaim({
      claim: { text: 'Aid networks formed', signal_refs: ['community_mutual_aid@idx:3'] },
      component: component({ interpretive_summary: true, narrative_grounding_score: 0.2 }),
      signalsByRef,
      reportContext,
    });
    assert.ok(out.context_kinds.includes(CLAIM_WEAKNESS_KINDS.INTERPRETIVE_COMPONENT));
    assert.ok(out.context_kinds.includes(CLAIM_WEAKNESS_KINDS.LOW_GROUNDING_COMPONENT));
    assert.ok(!out.weakness_kinds.includes(CLAIM_WEAKNESS_KINDS.LOW_GROUNDING_COMPONENT));
    assert.equal(out.unsupported, false);
  });
});

describe('crossReportCritique — report level', () => {
  it('suppresses low-grounding findings only when grounding never ran', () => {
    const comp = component({
      narrative_grounding_score: null,
      narrative_claims: [{ text: 'Aid networks formed', signal_refs: ['community_mutual_aid@idx:3'] }],
    });
    const out = critiqueReport(report({ signals: [signal()], components: [comp] }));
    assert.equal(out.report.grounding_computed, false);
    assert.deepEqual(out.claims[0].context_kinds, []);
  });

  it('keeps a computed score of zero as a real low-grounding finding', () => {
    // A degraded pipeline still computes grounding, so degradation must not
    // excuse a zero score.
    const comp = component({
      narrative_grounding_score: 0,
      narrative_claims: [{ text: 'Aid networks formed', signal_refs: ['community_mutual_aid@idx:3'] }],
    });
    const out = critiqueReport(report({ signals: [signal()], components: [comp], degraded: true }));
    assert.equal(out.report.grounding_computed, true);
    assert.ok(out.claims[0].context_kinds.includes(CLAIM_WEAKNESS_KINDS.LOW_GROUNDING_COMPONENT));
  });

  it('reports grounding as computed when any component carries a score', () => {
    const comp = component({
      narrative_claims: [{ text: 'Aid networks formed', signal_refs: ['community_mutual_aid@idx:3'] }],
    });
    const out = critiqueReport(report({ signals: [signal()], components: [comp] }));
    assert.equal(out.report.grounding_computed, true);
  });
});

function claim(text, componentId, kinds = [CLAIM_WEAKNESS_KINDS.UNRESOLVED_REF]) {
  return {
    component_id: componentId,
    text,
    tokens: claimTokens(text),
    signal_types: ['community_mutual_aid'],
    sources: ['ynetnews.com'],
    weakness_kinds: kinds,
    context_kinds: [],
    unsupported: kinds.includes(CLAIM_WEAKNESS_KINDS.UNRESOLVED_REF),
    support_count: 0,
    distinct_articles: 0,
    distinct_sources: 0,
  };
}

function withReport(c, date, file) {
  return { ...c, report: { date, scope: 'north', file } };
}

describe('crossReportCritique — clustering and aggregation', () => {
  it('does not merge the same sentence across different components', () => {
    const clusters = clusterClaims([
      claim('mutual aid networks organized rapidly', 'community_capital'),
      claim('mutual aid networks organized rapidly', 'belonging_solidarity'),
    ]);
    assert.equal(clusters.length, 2);
  });

  it('reports a claim recurring in two reports with the same persistent weakness', () => {
    const critiques = [
      {
        report: { date: '2026-04-01', scope: 'north', file: 'a.json', grounding_computed: true },
        claims: [withReport(claim('mutual aid networks organized rapidly', 'community_capital'), '2026-04-01', 'a.json')],
        component_summary: [],
      },
      {
        report: { date: '2026-04-02', scope: 'north', file: 'b.json', grounding_computed: true },
        claims: [withReport(claim('mutual aid networks organized rapidly', 'community_capital'), '2026-04-02', 'b.json')],
        component_summary: [],
      },
    ];
    const out = aggregateCritiques(critiques);
    assert.equal(out.recurring_weak_claims.length, 1);
    const finding = out.recurring_weak_claims[0];
    assert.equal(finding.recurrence, 2);
    assert.equal(finding.verbatim_repeat, true);
    assert.deepEqual(finding.persistent_weaknesses, [CLAIM_WEAKNESS_KINDS.UNRESOLVED_REF]);
  });

  it('drops a cluster whose weakness is not present in every occurrence', () => {
    const critiques = [
      {
        report: { date: '2026-04-01', scope: 'north', file: 'a.json', grounding_computed: true },
        claims: [withReport(claim('mutual aid networks organized rapidly', 'community_capital'), '2026-04-01', 'a.json')],
        component_summary: [],
      },
      {
        report: { date: '2026-04-02', scope: 'north', file: 'b.json', grounding_computed: true },
        claims: [withReport(
          claim('mutual aid networks organized rapidly', 'community_capital', [CLAIM_WEAKNESS_KINDS.SINGLE_SOURCE]),
          '2026-04-02',
          'b.json',
        )],
        component_summary: [],
      },
    ];
    assert.equal(aggregateCritiques(critiques).recurring_weak_claims.length, 0);
  });

  it('raises a caveat when grounding never ran', () => {
    const critiques = [{
      report: { date: '2026-04-01', scope: 'north', file: 'a.json', grounding_computed: false },
      claims: [],
      component_summary: [],
    }];
    const out = aggregateCritiques(critiques);
    assert.equal(out.caveats[0].kind, 'grounding_not_computed');
    assert.equal(out.totals.reports_without_claims, 1);
  });
});
