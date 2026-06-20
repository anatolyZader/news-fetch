import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopeAndPartitionSignals } from '../../../../business_modules/resilience/app/assessmentPipeline.js';
import { runPostExtractionAssessmentCore } from '../../../../business_modules/resilience/app/postExtractionAssessmentCore.js';
import { createGeoWiring } from '../../../../cross-cut-modules/geo/createGeoWiring.js';
import { attachGeoToSignals } from '../../../../cross-cut-modules/geo/attachGeoToSignals.js';
import { buildReferenceNameIndex } from '../../../../cross-cut-modules/geo/referenceNameIndex.js';
import { attributeSignalScope } from '../../../../cross-cut-modules/geo/attributeSignalScope.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function loadGeoMixedSignals() {
  const fixture = JSON.parse(
    readFileSync(resolve(ROOT, 'tests/fixtures/assess-signals-geo-mixed.json'), 'utf8'),
  );
  const { geoEnrichmentPort } = createGeoWiring({ rootDir: ROOT, unknownSourceType: 'test' });
  const nameIndex = buildReferenceNameIndex(ROOT);
  const needGeo = fixture.signals.filter((s) => !(s && 'geo' in s && s.geo));
  const { signals: enriched } = attachGeoToSignals(needGeo, geoEnrichmentPort, {
    sourceType: 'news',
    nameIndex,
  });
  const byEvidence = new Map(enriched.map((s) => [s.evidence, s]));
  return fixture.signals.map((s) => (s.geo ? s : byEvidence.get(s.evidence) ?? s));
}

describe('postExtractionAssessmentCore', () => {
  let prevForceDeterministic;

  before(() => {
    prevForceDeterministic = process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC = '1';
  });

  after(() => {
    if (prevForceDeterministic === undefined) delete process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    else process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC = prevForceDeterministic;
  });

  it('scope partition: national keeps all fixture signals; north filters to geo-relevant', () => {
    const signals = loadGeoMixedSignals();
    const national = scopeAndPartitionSignals(signals, 'national');
    const north = scopeAndPartitionSignals(signals, 'north');

    assert.equal(national.scopedSignals.length, 3);
    assert.ok(north.scopedSignals.length >= 1);
    assert.ok(north.scopedSignals.length < national.scopedSignals.length);
    assert.ok(north.narrativeScopeSignals.length >= north.scopedSignals.length);
  });

  it('runPostExtractionAssessmentCore scores before narrating', async () => {
    const order = [];
    const signal = {
      source_type: 'news',
      signal_type: 'information_clarity',
      evidence_type: 'named_institutional_fact',
      evidence: 'Official channel published clear instructions.',
      article_url: 'https://example.com/a',
      district_id: 'north',
    };

    await runPostExtractionAssessmentCore({
      allSignals: [signal],
      reportScopeId: 'national',
      reportDate: '2026-03-22',
      totalArticles: 1,
      historicalScores: [],
      attachDecisionBrief: false,
      onScoreComplete: () => order.push('score'),
      onNarrateComplete: () => order.push('narrate'),
    });

    assert.deepEqual(order, ['score', 'narrate']);
  });

  it('attributeSignalScope on news fixture yields persisted district_id for resolved geo', () => {
    const { signals, districtStamped } = attributeSignalScope(
      [
        {
          source_type: 'news',
          signal_type: 'compliance_enter_shelter',
          evidence: 'תושבי יבנאל דיווחו על לחץ ביומיום.',
          locality: 'יבנאל',
        },
      ],
      { rootDir: ROOT, sourceType: 'news', bundleDistrictId: 'north' },
    );
    assert.ok(signals[0].geo);
    assert.equal(signals[0].district_id, 'north');
    assert.ok(districtStamped >= 1);
  });
});
