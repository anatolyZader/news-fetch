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
  partitionByCodeEpoch,
  reportCodeEpoch,
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
      {
        // Third date: below this the sample cannot separate a pattern from a
        // coincidence, and recurring findings are withheld by design.
        report: { date: '2026-04-03', scope: 'north', file: 'c.json', grounding_computed: true },
        claims: [withReport(claim('shelters reopened on schedule', 'functional_continuity'), '2026-04-03', 'c.json')],
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

function stamped(date, file, epochSha, version = 'v11') {
  return {
    assessment: {
      date,
      report_scope: { id: 'north' },
      methodology: { scoring_model: { scoring_model_version: version, signal_to_components_sha256: epochSha } },
    },
  };
}

function critiqueRow(date, file, epoch, generatedAt) {
  return {
    report: { date, scope: 'north', file, grounding_computed: true, code_epoch: epoch, generated_at: generatedAt },
    claims: [withReport(claim('mutual aid networks organized rapidly', 'community_capital'), date, file)],
    component_summary: [],
  };
}

describe('crossReportCritique — code epoch scoping', () => {
  it('reads the epoch from the scoring_model stamp', () => {
    assert.equal(reportCodeEpoch(stamped('2026-04-02', 'a.json', 'd0686656aaaa')), 'v11/d0686656');
  });

  it('returns null for a report that predates the stamp', () => {
    assert.equal(reportCodeEpoch({ assessment: { date: '2026-04-02' } }), null);
  });

  it('keeps only the newest epoch and says what it dropped', () => {
    const rows = [
      critiqueRow('2026-04-01', 'a.json', 'v5/old', '2026-06-10T00:00:00Z'),
      critiqueRow('2026-04-02', 'b.json', 'v5/old', '2026-06-11T00:00:00Z'),
      critiqueRow('2026-04-03', 'c.json', 'v11/new', '2026-08-10T00:00:00Z'),
      critiqueRow('2026-04-04', 'd.json', 'v11/new', '2026-08-11T00:00:00Z'),
      critiqueRow('2026-04-05', 'e.json', 'v11/new', '2026-08-12T00:00:00Z'),
    ];
    const { kept, caveats } = partitionByCodeEpoch(rows);
    assert.equal(kept.length, 3);
    assert.ok(kept.every((r) => r.report.code_epoch === 'v11/new'));
    assert.equal(caveats[0].kind, 'code_epoch_scoped');
    assert.match(caveats[0].detail, /2 code epoch/);
  });

  it('does not scope when every report shares one epoch', () => {
    const rows = [
      critiqueRow('2026-04-01', 'a.json', 'v11/new', '2026-08-10T00:00:00Z'),
      critiqueRow('2026-04-02', 'b.json', 'v11/new', '2026-08-11T00:00:00Z'),
    ];
    const { kept, caveats } = partitionByCodeEpoch(rows);
    assert.equal(kept.length, 2);
    assert.deepEqual(caveats, []);
  });

  it('flags an entirely unstamped corpus as uninterpretable rather than pooling it silently', () => {
    const rows = [
      { report: { date: '2026-04-01', scope: 'north', file: 'a.json', code_epoch: null }, claims: [], component_summary: [] },
    ];
    const { kept, caveats } = partitionByCodeEpoch(rows);
    assert.equal(kept.length, 1);
    assert.equal(caveats[0].kind, 'code_epoch_unstamped');
  });

  it('withholds recurring findings when the epoch has too few report dates', () => {
    const rows = [
      critiqueRow('2026-04-01', 'a.json', 'v11/new', '2026-08-10T00:00:00Z'),
      critiqueRow('2026-04-02', 'b.json', 'v11/new', '2026-08-11T00:00:00Z'),
    ];
    const out = aggregateCritiques(rows);
    assert.deepEqual(out.recurring_weak_claims, [], 'two dates cannot separate pattern from coincidence');
    assert.equal(out.totals.recurring_findings, 0);
    assert.equal(out.totals.recurring_findings_withheld, 1, 'withheld, not absent');
    assert.ok(out.caveats.some((c) => c.kind === 'epoch_sample_too_small'));
    assert.equal(out.totals.report_dates_in_epoch, 2);
  });

  it('counts recurrence over dates, not over re-renders of one date', () => {
    const rows = [
      critiqueRow('2026-04-02', 'first.json', 'v11/new', '2026-08-10T00:00:00Z'),
      critiqueRow('2026-04-02', 'rerender.json', 'v11/new', '2026-08-11T00:00:00Z'),
      critiqueRow('2026-04-03', 'other.json', 'v11/new', '2026-08-12T00:00:00Z'),
      // A third date so the sample gate lets findings through; its claim differs
      // so it does not itself add to this cluster's recurrence.
      {
        report: {
          date: '2026-04-04', scope: 'north', file: 'd.json',
          grounding_computed: true, code_epoch: 'v11/new', generated_at: '2026-08-13T00:00:00Z',
        },
        claims: [withReport(claim('shelters reopened on schedule', 'functional_continuity'), '2026-04-04', 'd.json')],
        component_summary: [],
      },
    ];
    const out = aggregateCritiques(rows);
    const finding = out.recurring_weak_claims.find((f) => f.component_id === 'community_capital');
    // Four files, three claim-bearing dates — the two renders of 04-02 count once,
    // so this cluster spans 04-02 and 04-03 only.
    assert.equal(finding.recurrence, 2);
    assert.deepEqual(finding.dates, ['2026-04-02', '2026-04-03']);
  });
});
