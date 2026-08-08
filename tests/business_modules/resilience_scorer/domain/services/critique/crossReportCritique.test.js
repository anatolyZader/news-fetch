import { describe, it } from 'node:test';
import { strict as assert } from 'assert';

import {
  critiqueReport,
  aggregateCritiques,
  indexEvidenceByRef,
} from '../../../../../../business_modules/resilience_scorer/domain/services/critique/crossReportCritique.js';

/**
 * Minimal report: one component, one claim, and whichever containers the case
 * under test needs. `signals[]` is the scoped array; `evidence_user_structured`
 * is the wider evidence surface the narrative was actually built from.
 */
function buildReport({ signals = [], evidence = null, claims, date = '2026-04-02', assessment = {} }) {
  return {
    generated_at: `${date}T10:00:00.000Z`,
    signals,
    assessment: {
      date,
      report_scope: { id: 'north' },
      total_articles_analyzed: 40,
      components: [{
        component_id: 'narrative',
        narrative_grounding_score: 0.9,
        narrative_claims: claims,
        ...(evidence ? { evidence_user_structured: evidence } : {}),
      }],
      ...assessment,
    },
  };
}

function signal(overrides = {}) {
  return {
    signal_type: 'resilience_narrative_positive',
    article_index: 3,
    article_source: 'ynet.co.il',
    source_type: 'news',
    grounding_tier: 'grounded',
    extraction_confidence: 0.9,
    ...overrides,
  };
}

function firstClaim(report) {
  return critiqueReport(report, { filename: 'north-1-data-2026-04-02-produced-2026-08-05T1543Z.json' })
    .claims[0];
}

describe('crossReportCritique — evidence-surface fallback', () => {
  it('resolves a ref present only in evidence_user_structured', () => {
    // `signals[]` holds only the scoped subset; the narrative cited a wider pool.
    const claim = firstClaim(buildReport({
      signals: [signal()],
      evidence: [{
        ref: 'complacency_or_normalization@idx:11',
        signal_type: 'complacency_or_normalization',
        source_type: 'news',
        article_source: 'maariv.co.il',
        evidence: 'Population has normalized cascading threat conditions.',
        url: null,
      }],
      claims: [{
        text: 'Population has normalized perception of cascading threats.',
        signal_refs: ['complacency_or_normalization@idx:11'],
      }],
    }));

    assert.equal(claim.support_count, 1);
    assert.equal(claim.unsupported, false);
    assert.ok(!claim.weakness_kinds.includes('unknown_type_ref'));
    assert.ok(!claim.weakness_kinds.includes('unresolved_ref'));
  });

  it('keeps the article-level diversity check meaningful for fallback support', () => {
    // Evidence entries carry no article_index; without the ref-derived key both
    // would collapse to `src:news` and single_article would fire spuriously.
    const claim = firstClaim(buildReport({
      signals: [],
      evidence: [
        {
          ref: 'political_distrust@idx:4',
          signal_type: 'political_distrust',
          source_type: 'news',
          article_source: 'ynet.co.il',
          evidence: 'a',
        },
        {
          ref: 'political_distrust@idx:9',
          signal_type: 'political_distrust',
          source_type: 'news',
          article_source: 'maariv.co.il',
          evidence: 'b',
        },
      ],
      claims: [{
        text: 'Distrust of political leadership is voiced across outlets.',
        signal_refs: ['political_distrust@idx:4', 'political_distrust@idx:9'],
      }],
    }));

    assert.equal(claim.distinct_articles, 2);
    assert.ok(!claim.weakness_kinds.includes('single_article'));
  });

  it('does not invent grounding for fallback support', () => {
    // Evidence entries carry no grounding_tier, so ungrounded_support must not
    // fire on them — absent is not the same as ungrounded.
    const claim = firstClaim(buildReport({
      signals: [],
      evidence: [{
        ref: 'political_distrust@idx:4',
        signal_type: 'political_distrust',
        source_type: 'news',
        article_source: 'ynet.co.il',
        evidence: 'a',
      }],
      claims: [{ text: 'Distrust is voiced.', signal_refs: ['political_distrust@idx:4'] }],
    }));

    assert.ok(!claim.weakness_kinds.includes('ungrounded_support'));
    assert.equal(claim.unsupported, false);
  });

  it('is a no-op on reports without an evidence surface', () => {
    const claim = firstClaim(buildReport({
      signals: [signal()],
      evidence: null,
      claims: [{
        text: 'Population has normalized perception of cascading threats.',
        signal_refs: ['complacency_or_normalization@idx:11'],
      }],
    }));

    assert.ok(claim.weakness_kinds.includes('unknown_type_ref'));
    assert.equal(claim.unsupported, true);
  });

  it('indexes only signal-namespace refs', () => {
    const index = indexEvidenceByRef([{
      evidence_user_structured: [
        { ref: 'political_distrust@idx:4', signal_type: 'political_distrust' },
        { ref: 'open:obs-3', signal_type: null },
        { signal_type: 'no_ref_at_all' },
      ],
    }]);

    assert.equal(index.size, 1);
    assert.ok(index.has('political_distrust@idx:4'));
  });
});

describe('crossReportCritique — structural tier', () => {
  const pboClaim = {
    text: 'The authority runs volunteer mobilisation continuously.',
    signal_refs: ['community_volunteering@idx:2'],
  };

  it('demotes single-point flags when every support is one-source-by-nature', () => {
    const claim = firstClaim(buildReport({
      signals: [signal({
        signal_type: 'community_volunteering',
        article_index: 2,
        source_type: 'pbo',
        article_source: 'pbo-אעבלין',
      })],
      claims: [pboClaim],
    }));

    assert.deepEqual(claim.weakness_kinds, []);
    assert.deepEqual(
      claim.structural_kinds.sort(),
      ['single_article', 'single_channel', 'single_source'],
    );
    // The condition is still recorded, just not counted against the claim.
    assert.ok(claim.weaknesses.some((w) => w.kind === 'single_article' && w.structural === true));
  });

  it('keeps them as weakness for news-backed support', () => {
    const claim = firstClaim(buildReport({
      signals: [signal({ signal_type: 'community_volunteering', article_index: 2 })],
      claims: [pboClaim],
    }));

    assert.ok(claim.weakness_kinds.includes('single_article'));
    assert.deepEqual(claim.structural_kinds, []);
  });

  it('keeps them as weakness when support mixes pbo with news', () => {
    const claim = firstClaim(buildReport({
      signals: [
        signal({ signal_type: 'community_volunteering', article_index: 2, source_type: 'pbo' }),
        signal({ signal_type: 'community_volunteering', article_index: 2, source_type: 'news' }),
      ],
      claims: [pboClaim],
    }));

    assert.ok(claim.weakness_kinds.includes('single_article'));
    assert.deepEqual(claim.structural_kinds, []);
  });
});

function emptyReport({ date, scopedSignalCount, generatedAt }) {
  return {
    generated_at: generatedAt,
    signals: [],
    assessment: {
      date,
      report_scope: { id: 'north' },
      scoped_signal_count: scopedSignalCount,
      components: [{ component_id: 'narrative', narrative_claims: [] }],
    },
  };
}

describe('crossReportCritique — empty-report and epoch caveats', () => {
  it('splits a failed empty report from a genuinely thin one', () => {
    const aggregate = aggregateCritiques([
      critiqueReport(emptyReport({
        date: '2026-04-01', scopedSignalCount: 284, generatedAt: '2026-08-08T15:16:54.322Z',
      })),
      critiqueReport(emptyReport({
        date: '2026-05-20', scopedSignalCount: 9, generatedAt: '2026-08-08T11:27:00.000Z',
      })),
    ]);

    assert.equal(aggregate.totals.reports_without_claims, 2);
    assert.equal(aggregate.totals.reports_empty_failed, 1);
    assert.equal(aggregate.totals.reports_empty_thin, 1);

    const caveat = aggregate.caveats.find((c) => c.kind === 'empty_assessment');
    assert.deepEqual(caveat.dates, ['2026-04-01']);
  });

  it('treats a report with no scoped_signal_count as thin, not failed', () => {
    // Pre-epoch reports lack the field; there is no trustworthy volume measure,
    // so stay silent rather than cry wolf.
    const aggregate = aggregateCritiques([
      critiqueReport(emptyReport({
        date: '2026-04-15', scopedSignalCount: undefined, generatedAt: '2026-06-10T17:39:00.000Z',
      })),
    ]);

    assert.equal(aggregate.totals.reports_empty_failed, 0);
    assert.equal(aggregate.totals.reports_empty_thin, 1);
    assert.ok(!aggregate.caveats.some((c) => c.kind === 'empty_assessment'));
  });

  it('flags a render-epoch spread wider than the threshold', () => {
    const aggregate = aggregateCritiques([
      critiqueReport(emptyReport({
        date: '2026-04-01', scopedSignalCount: 9, generatedAt: '2026-06-10T10:00:00.000Z',
      })),
      critiqueReport(emptyReport({
        date: '2026-04-02', scopedSignalCount: 9, generatedAt: '2026-08-08T10:00:00.000Z',
      })),
    ]);

    const caveat = aggregate.caveats.find((c) => c.kind === 'render_epoch_spread');
    assert.ok(caveat);
    assert.match(caveat.detail, /59 days apart/);
  });

  it('stays silent when every report came off the same build window', () => {
    const aggregate = aggregateCritiques([
      critiqueReport(emptyReport({
        date: '2026-04-01', scopedSignalCount: 9, generatedAt: '2026-08-05T10:00:00.000Z',
      })),
      critiqueReport(emptyReport({
        date: '2026-04-02', scopedSignalCount: 9, generatedAt: '2026-08-08T10:00:00.000Z',
      })),
    ]);

    assert.ok(!aggregate.caveats.some((c) => c.kind === 'render_epoch_spread'));
  });
});
