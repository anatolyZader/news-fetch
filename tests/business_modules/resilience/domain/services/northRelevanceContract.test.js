import assert from 'node:assert/strict';
import test from 'node:test';

import { northRelevanceFromResolvedGeo } from '../../../../../cross-cut-modules/geo/northRelevanceFromResolvedGeo.js';
import { scopeDecisionForSignal } from '../../../../../business_modules/resilience/domain/services/regionSignalFilter.js';

const METRICS_SAFE_GOLAN = {
  kind: 'resolved',
  policy: { usableForMetrics: true, scopeConfidence: 'high' },
  classification: { pboSubregionId: 'golan', geoAreaTags: ['north', 'golan_heights'] },
};

const METRICS_UNSAFE_GOLAN = {
  kind: 'resolved',
  policy: { usableForMetrics: false, scopeConfidence: 'low' },
  classification: { pboSubregionId: 'golan', geoAreaTags: ['north', 'golan_heights'] },
};

const NEUTRAL_EVIDENCE = { source_type: 'news', evidence: 'general municipal update' };

test('northRelevanceFromResolvedGeo matches scopeDecisionForSignal when only geo path applies', () => {
  for (const geo of [METRICS_SAFE_GOLAN, METRICS_UNSAFE_GOLAN]) {
    const fromGeo = northRelevanceFromResolvedGeo(geo);
    const fromSignal = scopeDecisionForSignal({ ...NEUTRAL_EVIDENCE, geo });
    assert.equal(fromSignal.isNorthRelevant, fromGeo.isNorthRelevant, `isNorthRelevant geo=${JSON.stringify(geo.policy)}`);
  }
});

test('metrics-unsafe geo does not block keyword_fallback when evidence has north terms', () => {
  const d = scopeDecisionForSignal({
    source_type: 'news',
    evidence: 'Residents in Kiryat Shmona entered shelters.',
    geo: METRICS_UNSAFE_GOLAN,
  });
  assert.equal(d.isNorthRelevant, true);
  assert.equal(d.source, 'keyword_fallback');
});
