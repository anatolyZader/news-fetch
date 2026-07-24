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
