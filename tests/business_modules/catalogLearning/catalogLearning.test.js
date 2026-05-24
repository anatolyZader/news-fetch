import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clusterByPrefix,
  cosineSimilarity,
  rankClusters,
} from '../../../business_modules/catalogLearning/domain/services/oovClusterer.js';
import { LEARNING_CAPTURE_KINDS } from '../../../cross-cut-modules/learningCapture/kinds.js';
import { formatGapReportMarkdown } from '../../../business_modules/catalogLearning/domain/services/gapReportFormatter.js';
import { buildResidualCapturePrompt } from '../../../business_modules/resilience/infrastructure/extractionPasses.js';
import { extractTopKParagraphsForLearning } from '../../../business_modules/resilience/infrastructure/learningCaptureText.js';
import {
  isLearningCaptureEnabled,
  isResidualCaptureEnabled,
} from '../../../business_modules/resilience/domain/services/oovCapture.js';

describe('catalogLearning oovClusterer', () => {
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

  it('cosineSimilarity returns 1 for identical vectors', () => {
    const v = new Float32Array([1, 0, 0]);
    assert.equal(cosineSimilarity(v, v), 1);
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
});

describe('learning capture helpers', () => {
  it('buildResidualCapturePrompt includes article bodies', () => {
    const { system, user } = buildResidualCapturePrompt([
      { url: 'https://example.com', body: 'Residents organized a barter market.' },
    ]);
    assert.match(system, /Do NOT invent snake_case/);
    assert.match(user, /barter market/);
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
