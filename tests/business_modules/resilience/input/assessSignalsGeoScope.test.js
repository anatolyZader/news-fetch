import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createGeoWiring } from '../../../../cross-cut-modules/geo/createGeoWiring.js';
import { attachGeoToSignals } from '../../../../cross-cut-modules/geo/attachGeoToSignals.js';
import { buildReferenceNameIndex } from '../../../../cross-cut-modules/geo/referenceNameIndex.js';
import {
  filterSignalsForScope,
} from '../../../../business_modules/resilience/domain/services/regionSignalFilter.js';
import { summarizeScopeDecisionSources } from '../../../../business_modules/resilience/domain/services/assessmentMethodology.js';

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
  if (kiryatScoped?.geo?.kind === 'resolved' && kiryatScoped.geo.policy?.usableForMetrics !== false) {
    assert.equal(kiryatScoped.scopeDecision?.source, 'geo_tags');
  }

  assert.ok(summary.north_relevant_signals >= 1);
});
