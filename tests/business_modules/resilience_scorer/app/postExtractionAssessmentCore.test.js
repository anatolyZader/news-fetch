import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopeAndPartitionSignals } from '../../../../business_modules/resilience_scorer/app/assessmentPipeline.js';
import { prepareInvestigationSignals } from '../../../../business_modules/resilience_scorer/app/prepareInvestigationSignals.js';
import { prepareScoringSignals } from '../../../../business_modules/resilience_scorer/app/prepareScoringSignals.js';
import { runScoringPipeline } from '../../../../business_modules/resilience_scorer/app/scoringPipelinePrep.js';
import { attachInvestigationDiagnostics } from '../../../../business_modules/resilience_scorer/domain/services/componentDiagnostics.js';
import { runPostExtractionAssessmentCore } from '../../../../business_modules/resilience_scorer/app/postExtractionAssessmentCore.js';
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
  let prevClosedCore;

  before(() => {
    prevForceDeterministic = process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    prevClosedCore = process.env.RESILIENCE_CLOSED_CORE_ASSESS;
    process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC = '1';
    process.env.RESILIENCE_CLOSED_CORE_ASSESS = '0';
  });

  after(() => {
    if (prevForceDeterministic === undefined) delete process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    else process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC = prevForceDeterministic;
    if (prevClosedCore === undefined) delete process.env.RESILIENCE_CLOSED_CORE_ASSESS;
    else process.env.RESILIENCE_CLOSED_CORE_ASSESS = prevClosedCore;
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

  it('digital darkness scoring partition keeps full investigation and narrative pools', async () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const pbo = {
      source_type: 'pbo',
      signal_type: 'information_clarity',
      evidence_type: 'named_institutional_fact',
      evidence: 'Officers report continued operations.',
      article_url: 'https://example.com/pbo',
    };
    const news = {
      source_type: 'news',
      signal_type: 'information_clarity',
      evidence_type: 'named_institutional_fact',
      evidence: 'News channel reports public concern.',
      article_url: 'https://example.com/news',
    };
    const allSignals = [pbo, news];

    const scoped = scopeAndPartitionSignals(allSignals, 'national');
    const investigationPrep = await prepareInvestigationSignals({
      investigationSignals: scoped.baseSignalsForScoring,
      reportDate: '2026-04-03',
      reportScopeId: 'national',
      reportsDir: '/tmp/nonexistent-reports-dir',
    });
    const prepared = await prepareScoringSignals({
      signalsForScoring: scoped.baseSignalsForScoring,
      reportDate: '2026-04-03',
      reportScopeId: 'national',
      reportsDir: '/tmp/nonexistent-reports-dir',
    });

    const dataVoid = {
      ...prepared.dataVoid,
      digital_darkness: true,
      level: 'critical',
      field_volume: 1,
      actual_digital_volume: 1,
    };

    const pipelineResult = runScoringPipeline({
      signalsForScoring: prepared.signalsForScoring,
      dataVoid,
      totalArticles: 2,
      mediaSignals: scoped.scopedSignals,
      scopeId: 'national',
      reportDate: '2026-04-03',
    });

    assert.equal(pipelineResult.partition?.partitionApplied, true);
    assert.equal(pipelineResult.scoringSignals.length, 1);
    assert.equal(pipelineResult.scoringSignals[0].source_type, 'pbo');
    assert.ok(investigationPrep.investigationSignals.some((s) => s.source_type === 'news'));
    assert.ok(scoped.narrativeScopeSignals.some((s) => s.source_type === 'news'));
    assert.ok(pipelineResult.digitalInclusiveScored != null);

    const assessment = { components: [], agent_trace_id: 'test-trace' };
    attachInvestigationDiagnostics(assessment, {
      scoring: {
        investigationSignals: investigationPrep.investigationSignals,
        signalsForScoring: pipelineResult.scoringSignals,
        scopedSignals: scoped.scopedSignals,
        narrativeScopeSignals: scoped.narrativeScopeSignals,
        scoringPartition: pipelineResult.partition,
        scoringAssessmentMode: pipelineResult.assessmentMode,
        scoredFull: pipelineResult.scoredFull,
      },
    });

    assert.equal(assessment.investigation_summary.signals_scoring_quarantined, 1);
    assert.equal(assessment.investigation_summary.signals_narrative_scope, 2);
    assert.equal(assessment.investigation_summary.scoring_partition_applied, true);
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
