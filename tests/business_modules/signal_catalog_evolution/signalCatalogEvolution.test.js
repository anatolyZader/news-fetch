import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clusterByPrefix,
  rankClusters,
} from '../../../business_modules/signal_catalog_evolution/domain/services/oovClusterer.js';
import { LEARNING_CAPTURE_KINDS } from '../../../business_modules/resilience_scorer/domain/contracts/learningCaptureKinds.js';
import { formatGapReportMarkdown } from '../../../business_modules/signal_catalog_evolution/domain/services/gapReportFormatter.js';
import { buildResidualCapturePrompt } from '../../../business_modules/resilience_scorer/infrastructure/extractionPasses.js';
import { buildResidualExtractionPrompt } from '../../../business_modules/open_observation_extraction/domain/services/openExtractionPrompts.js';
import { ObservationCaptureAdapter } from '../../../business_modules/signal_catalog_evolution/infrastructure/adapters/observationCaptureAdapter.js';
import { CompositeLearningCaptureAdapter } from '../../../business_modules/signal_catalog_evolution/infrastructure/adapters/compositeLearningCaptureAdapter.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractTopKParagraphsForLearning } from '../../../business_modules/resilience_scorer/infrastructure/learningCaptureText.js';
import {
  isLearningCaptureEnabled,
  isResidualCaptureEnabled,
} from '../../../business_modules/resilience_scorer/domain/services/oov/oovCapture.js';

describe('signalCatalogEvolution oovClusterer', () => {
  it('clusters unknown types by suggested_type', () => {
    const records = [
      { capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE, suggested_type: 'barter_economy', evidence: 'a' },
      { capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE, suggested_type: 'barter_economy', evidence: 'b' },
      { capture_kind: LEARNING_CAPTURE_KINDS.SELF_CHECK_UNCERTAIN, signal_type: 'self_organization', evidence: 'c' },
    ];
    const clusters = clusterByPrefix(records);
    assert.ok(clusters.some((c) => c.key === 'barter_economy' && c.count === 2));
  });

  it('ranks clusters with novelty and source diversity', () => {
    const ranked = rankClusters([
      { key: 'a', count: 2, distinct_sources: 1, high_novelty_count: 0, medium_novelty_count: 0, kinds: {} },
      { key: 'b', count: 3, distinct_sources: 4, high_novelty_count: 2, medium_novelty_count: 1, kinds: {} },
    ], { minCount: 2 });
    assert.equal(ranked[0].key, 'b');
    assert.ok(ranked[0].priority_score > ranked[1].priority_score);
  });

  it('ranks verified open observations higher than unknown types', () => {
    const ranked = rankClusters([
      {
        key: 'a',
        count: 3,
        distinct_sources: 1,
        high_novelty_count: 0,
        medium_novelty_count: 0,
        kinds: { [LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE]: 3 },
      },
      {
        key: 'b',
        count: 3,
        distinct_sources: 1,
        high_novelty_count: 0,
        medium_novelty_count: 0,
        kinds: { [LEARNING_CAPTURE_KINDS.VERIFIED_OPEN_OBSERVATION]: 3 },
      },
    ], { minCount: 2 });
    assert.equal(ranked[0].key, 'b');
  });
});

describe('gapReportFormatter', () => {
  it('renders markdown with clusters', () => {
    const md = formatGapReportMarkdown({
      generated_at: '2026-05-24T00:00:00.000Z',
      file_count: 1,
      total_records: 2,
      clustering_method: 'prefix',
      kind_counts: { unknown_type: 2 },
      clusters: [{
        key: 'barter_economy',
        count: 2,
        priority_score: 10,
        kinds: { unknown_type: 2 },
        distinct_sources: 2,
        related_types: ['self_organization'],
        high_novelty_count: 1,
        medium_novelty_count: 0,
        sample_evidence: ['Residents traded food for medicine'],
      }],
    });
    assert.match(md, /Catalog Gap Report/);
    assert.match(md, /barter_economy/);
  });

  it('renders nearest catalog and counterexample sections', () => {
    const md = formatGapReportMarkdown({
      generated_at: '2026-05-24T00:00:00.000Z',
      file_count: 1,
      total_records: 2,
      clustering_method: 'prefix',
      kind_counts: { unknown_type: 2 },
      clusters: [{
        key: 'barter_economy',
        count: 2,
        priority_score: 10,
        kinds: { unknown_type: 2 },
        distinct_sources: 2,
        related_types: [],
        high_novelty_count: 0,
        medium_novelty_count: 0,
        sample_evidence: ['trade goods'],
        nearest_catalog: [{ type: 'self_organization', label: 'Self-organization', snippet: 'community mutual aid' }],
        counterexamples: [{ type: 'self_organization', reject_snippet: 'pure political rally' }],
      }],
    });
    assert.match(md, /Nearest catalog entries/);
    assert.match(md, /Counterexamples/);
    assert.match(md, /self_organization/);
  });
});

describe('learning capture helpers', () => {
  it('buildResidualCapturePrompt includes article bodies', () => {
    const { system, user } = buildResidualCapturePrompt([
      { url: 'https://example.com', body: 'Residents organized a barter market.' },
    ]);
    assert.match(system, /Do NOT invent snake_case/);
    assert.match(user, /barter market/);
  });

  it('buildResidualExtractionPrompt aligns with open_observation_extraction residual profile', () => {
    const { system } = buildResidualExtractionPrompt([
      { body: 'Residents organized a barter market.' },
    ]);
    assert.match(system, /RESIDUAL/);
    assert.match(system, /nearest_existing_types/);
  });

  it('extractTopKParagraphsForLearning picks relevant paragraphs', () => {
    const body = 'Political analysis only.\n\nResidents entered the shelter during the siren alert.';
    const out = extractTopKParagraphsForLearning(body, 1);
    assert.match(out, /shelter/);
  });

  it('capture flags respect env', () => {
    assert.equal(isLearningCaptureEnabled({ RESILIENCE_OOV_CAPTURE: '0' }), false);
    assert.equal(isResidualCaptureEnabled({ RESILIENCE_RESIDUAL_CAPTURE: '1' }), true);
  });
});

describe('observationCaptureAdapter', () => {
  it('loads open observations as capture records', async () => {
    const dir = join(tmpdir(), `obs-capture-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeFileSync(join(dir, `observations-exploratory-${recentDate}.json`), JSON.stringify({
      profile: 'exploratory',
      date: recentDate,
      extracted_at: new Date().toISOString(),
      observations: [
        { evidence: 'local fact', behavioral_description: 'fact', suggested_catalog_types: [] },
      ],
    }));

    const adapter = new ObservationCaptureAdapter({ dataDir: dir });
    const { records } = await adapter.loadCaptureRecords({ maxDays: 14 });
    assert.equal(records.length, 1);
    assert.equal(records[0].capture_kind, LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION);

    rmSync(dir, { recursive: true, force: true });
  });

  it('composite adapter merges record lists', async () => {
    const composite = new CompositeLearningCaptureAdapter([
      { async loadCaptureRecords() { return { records: [{ capture_kind: 'a', evidence: 'x' }], files: ['a.jsonl'] }; } },
      { async loadCaptureRecords() { return { records: [{ capture_kind: 'b', evidence: 'y' }], files: ['b.json'] }; } },
    ]);
    const { records, files } = await composite.loadCaptureRecords();
    assert.equal(records.length, 2);
    assert.equal(files.length, 2);
  });
});
