import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createGeoWiring } from '../../../../cross-cut-modules/geo/createGeoWiring.js';
import { attachGeoToSignals } from '../../../../cross-cut-modules/geo/attachGeoToSignals.js';
import { buildReferenceNameIndex } from '../../../../cross-cut-modules/geo/referenceNameIndex.js';
import { filterSignalsForScope, scopeDecisionForSignal } from '../../../../business_modules/resilience_scorer/domain/services/signals/regionSignalFilter.js';
import { summarizeScopeDecisionSources } from '../../../../business_modules/resilience_scorer/domain/epistemic/assessmentMethodology.js';
import { annotateSignalsEpistemics, partitionMacroSignals } from '../../../../business_modules/resilience_scorer/domain/services/signals/evidenceEligibility.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

test('geo attach resolves reference locality in evidence for north scope', () => {
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
  const yavneelSignal = fixture.signals.find((s) => s.evidence.includes('יבנאל'));
  const attachedYavneel = [...byEvidence.values()].find((s) => s.evidence.includes('יבנאל'));
  const kiryatSignal = enriched.find((s) => s.evidence.includes('Kiryat Shmona'));

  const all = fixture.signals.map((s) => (s.geo ? s : byEvidence.get(s.evidence) ?? s));
  const scoped = filterSignalsForScope(all, 'north');
  const summary = summarizeScopeDecisionSources(scoped, { reportScopeId: 'north' });

  assert.ok(kiryatSignal?.geo?.kind === 'resolved' || kiryatSignal?.geo?.kind === 'unknown');
  if (attachedYavneel) {
    const d = scoped.find((s) => s.evidence === yavneelSignal.evidence)?.scopeDecision;
    assert.ok(d?.isNorthRelevant);
    assert.equal(d?.source, 'geo_tags');
  }

  const kiryatScoped = scoped.find((s) => s.evidence.includes('Kiryat Shmona'));
  if (kiryatScoped?.geo?.kind === 'resolved') {
    assert.equal(kiryatScoped.geo.policy?.usableForMetrics, false);
    assert.equal(kiryatScoped.geo.resolution?.provenance, 'text_inferred');
  }

  assert.ok(summary.north_relevant_signals >= 1);
});

test('discourse-only studio mention does not attach geo or north scope', () => {
  const { geoEnrichmentPort } = createGeoWiring({ rootDir: ROOT, unknownSourceType: 'test' });
  const nameIndex = buildReferenceNameIndex(ROOT);
  const signal = {
    source_type: 'news',
    signal_type: 'panic_behavior',
    evidence: 'Analysts in Tel Aviv discussed Kiryat Shmona shelters.',
    article_url: 'https://example.com/studio',
  };

  const { signals: enriched, attached } = attachGeoToSignals([signal], geoEnrichmentPort, {
    sourceType: 'news',
    nameIndex,
  });
  assert.equal(attached, 0);
  assert.equal(enriched[0].geo, undefined);

  const decision = scopeDecisionForSignal(enriched[0]);
  assert.equal(decision.isNorthRelevant, false);
});

test('text_inferred news geo is excluded from north metrics partition', () => {
  const { geoEnrichmentPort } = createGeoWiring({ rootDir: ROOT, unknownSourceType: 'test' });
  const nameIndex = buildReferenceNameIndex(ROOT);
  const signal = {
    source_type: 'news',
    signal_type: 'compliance_enter_shelter',
    evidence: 'Residents in Kiryat Shmona entered shelters after alerts.',
    article_url: 'https://example.com/local',
  };

  const { signals: enriched } = attachGeoToSignals([signal], geoEnrichmentPort, {
    sourceType: 'news',
    nameIndex,
  });
  const scoped = annotateSignalsEpistemics(filterSignalsForScope(enriched, 'north'), { reportScope: 'north' });
  const { metricsSignals, macroSignals } = partitionMacroSignals(scoped, 'north');

  assert.equal(enriched[0]?.geo?.policy?.usableForMetrics, false);
  assert.equal(metricsSignals.length, 0);
  assert.equal(macroSignals.length, 1);
});
