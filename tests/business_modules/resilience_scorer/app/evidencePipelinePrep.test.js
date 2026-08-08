import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evidenceComponentAdapter } from '../../../../business_modules/resilience_scorer/app/assessment/evidencePipelinePrep.js';

function evEntry(basisOverrides = {}) {
  return {
    evidence_basis: {
      signal_count: 10,
      distinct_articles: 8,
      distinct_sources: 2,
      positive_count: 8,
      negative_count: 2,
      sufficiency: 'adequate',
      balance: 'mixed',
      concentration_warning: null,
      ...basisOverrides,
    },
    critical_flags: { presence_gate: null, salient_single_signal: null },
    signals: [],
    sampling_status: 'normal',
  };
}

describe('evidenceComponentAdapter confidence', () => {
  it('adequate sufficiency without concentration maps to high', () => {
    const comp = evidenceComponentAdapter(evEntry());
    assert.equal(comp.confidence, 'high');
    assert.equal(comp.confidence_caveat, null);
  });

  it('extreme source concentration (>=90%) downgrades one band with a caveat', () => {
    // The wellbeing case from the 2026-04-01 north report: adequate volume but
    // 96% of signals from a single source type must not read as "high".
    const comp = evidenceComponentAdapter(evEntry({
      concentration_warning: { layer: 'source_type', key: 'visits', share: 0.96 },
    }));
    assert.equal(comp.confidence, 'medium');
    assert.match(comp.confidence_caveat, /source type "visits" holds 96%/);
  });

  it('moderate concentration (below 90%) does not downgrade', () => {
    const comp = evidenceComponentAdapter(evEntry({
      concentration_warning: { layer: 'source_type', key: 'pbo', share: 0.71 },
    }));
    assert.equal(comp.confidence, 'high');
  });

  it('downgrade floors at low', () => {
    const comp = evidenceComponentAdapter(evEntry({
      sufficiency: 'thin',
      concentration_warning: { layer: 'article_source', key: 'ynet', share: 1 },
    }));
    assert.equal(comp.confidence, 'low');
  });
});

describe('evidenceComponentAdapter review completeness', () => {
  function reviewBasis(incomplete_share, extra = {}) {
    return {
      review_completeness: {
        pbo_primary_count: 10,
        reviewed_sufficient: 0,
        reviewed_incomplete: 10,
        unreviewed: 0,
        incomplete_share,
      },
      ...extra,
    };
  }

  it('downgrades one step when a majority of evidence was reviewed as incomplete', () => {
    const comp = evidenceComponentAdapter(evEntry(reviewBasis(0.5)));
    assert.equal(comp.confidence, 'medium');
    assert.match(comp.confidence_caveat, /50% of evidence from PBO reports reviewed as incomplete/);
  });

  it('leaves confidence alone just below the threshold', () => {
    const comp = evidenceComponentAdapter(evEntry(reviewBasis(0.49)));
    assert.equal(comp.confidence, 'high');
    assert.equal(comp.confidence_caveat, null);
  });

  it('treats a null review_completeness as a no-op', () => {
    const comp = evidenceComponentAdapter(evEntry({ review_completeness: null }));
    assert.equal(comp.confidence, 'high');
    assert.equal(comp.confidence_caveat, null);
  });

  it('does not stack downgrades when concentration and review both fire', () => {
    // Both reasons hold on PBO-dominated components, so stacking would be the
    // common case and would flatten high straight to low, skipping medium.
    const comp = evidenceComponentAdapter(evEntry(reviewBasis(1, {
      concentration_warning: { layer: 'source_type', key: 'pbo', share: 0.96 },
    })));
    assert.equal(comp.confidence, 'medium');
    assert.match(comp.confidence_caveat, /source type "pbo" holds 96% of signals/);
    assert.match(comp.confidence_caveat, /100% of evidence from PBO reports reviewed as incomplete/);
  });

  it('floors at low rather than dropping below it', () => {
    const comp = evidenceComponentAdapter(evEntry(reviewBasis(1, { sufficiency: 'thin' })));
    assert.equal(comp.confidence, 'low');
  });
});
